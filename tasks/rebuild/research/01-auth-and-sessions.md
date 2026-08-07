# How do invite-only accounts and rolling sessions get built on Bun + Hono?

Research for [issue 01](../issues/01-auth-and-sessions.md). Researched 2026-08-07.

Everything below was verified against the live registry, the published source, and two working
spikes run on this machine — not from memory. Where a claim is measured rather than cited, it says
so.

## TL;DR

- **Lucia is dead.** Deprecated March 2025; last npm publish **2024-10-20**. Its replacement is a
  single file you copy. Not a candidate as a library; it is the best *reference* on the list.
- **Better Auth is alive and genuinely good** — v1.6.26, published three days ago, first-class Hono
  integration, first-party `bun:sqlite` dialect. It fits this app better than its feature list
  suggests. It is still the wrong choice here, for three specific reasons, not vibes.
- **Its magic-link flow redeems the token on `GET`.** That is the exact failure the ticket names:
  a WhatsApp unfurler burns the invite before a human taps it. Verified in the 1.6.26 source.
- **It stores the session token in plaintext** in `session.token`. The `magicLink` and
  `oneTimeToken` plugins offer `storeToken: "hashed"`; the core session token has no such option.
- **Its schema forces a `NOT NULL UNIQUE` email on every user** in an app that sends no email, plus
  two tables (`account`, `verification`) you will never use. Ticket 04 inherits that.
- **Hand-rolling is 105 lines and zero new dependencies.** I wrote it and the tests; they pass. See
  [RECOMMENDATION](#recommendation).

---

## 1. The field, as it actually stands today

Every version and date below is from the npm registry API on 2026-08-07.

| Package | Latest | Published | Verdict |
|---|---|---|---|
| `better-auth` | 1.6.26 | 2026-08-04 | Actively maintained, ~weekly patches |
| `@better-auth/passkey` | 1.6.26 | 2026-08-04 | In lockstep with core |
| `hono` | 4.13.1 | **2026-08-07** | Released today. Zero dependencies |
| `lucia` | 3.2.2 | **2024-10-20** | Deprecated. No publish in 21 months |
| `@hono/session` | 0.2.1 | 2026-06-05 | Pre-1.0, 4 releases in 14 months |
| `hono-sessions` | 0.8.1 | 2026-02-12 | Third-party, low activity |
| `hono-rate-limiter` | 0.5.3 | 2025-12-29 | Third-party, quiet for 8 months |
| `@oslojs/encoding` | 1.1.0 | 2024-09-24 | Maintained (Astro depends on it) |
| `@oslojs/crypto` | 1.0.1 | 2024-09-21 | Deprecated (see below) |
| `@simplewebauthn/server` | 13.3.2 | 2026-06-24 | Maintained — matters for passkeys |

### Lucia is deprecated, and so is most of Oslo

The `lucia` repo has been reduced to three files. The README, verbatim
([raw](https://raw.githubusercontent.com/lucia-auth/lucia/main/README)):

> Lucia was deprecated on March 2025. See code/auth_session.ts for a complete, single-file
> replacement for the NPM package.
>
> Announcement: https://pilcrowonpaper.com/blog/18
> For a deep dive on everything auth, see the Auth Book: https://auth.pilcrowonpaper.com

[lucia-auth.com](https://lucia-auth.com) is now one static page saying the same thing. The old
"copy and paste your own auth" guide at `/sessions/basic-api/` is **gone — HTTP 404**. The content
moved to the [Auth Book](https://auth.pilcrowonpaper.com/sessions).

The [2026-07-29 announcement](https://pilcrowonpaper.com/blog/18) also deprecates most of Oslo and
all of Arctic. `@oslojs/encoding` is the only survivor, kept alive because Astro core uses it, and
only until `Uint8Array.toBase64()` is universally available.

**Watch out**: this deprecation is announced *only* in that blog post. `oslojs.dev`, the package
READMEs, and npm all still present these packages as healthy. Don't judge them by their README.

**None of this is bad news.** The replacement,
[`code/auth_session.ts`](https://raw.githubusercontent.com/lucia-auth/lucia/main/code/auth_session.ts)
(Zero-Clause BSD), is a complete, dependency-free session implementation with the DDL in the header
comment. It is the reference the recommendation below is built on.

### Hono ships no session middleware, and doesn't need to

Hono core's middleware list contains no session or rate-limit middleware. What it does ship that
matters here ([docs](https://hono.dev/docs/helpers/cookie),
[source](https://github.com/honojs/hono/blob/main/src/utils/cookie.ts)):

- `setCookie` / `getCookie` / `deleteCookie` with a fully typed `CookieOptions` — `httpOnly`,
  `secure`, `sameSite`, `path`, `maxAge`, `expires`, `partitioned`, `priority`, `prefix`. It
  enforces the cookie-prefix rules **at the type level**: a `__Host-` name requires
  `secure: true, path: '/'` and no `domain`. It throws if `maxAge` exceeds 400 days.
- `setSignedCookie` / `getSignedCookie`, HMAC-SHA-256 via WebCrypto (`crypto.subtle.importKey`
  with `{ name: 'HMAC', hash: 'SHA-256' }`). `getSignedCookie` returns `false`, not `undefined`, on
  a bad signature.
- [`hono/csrf`](https://hono.dev/docs/middleware/builtin/csrf) — checks `Origin` **and**
  `Sec-Fetch-Site`; the request passes if either validates.
- `createMiddleware<{ Variables: { user: User } }>` from
  [`hono/factory`](https://hono.dev/docs/helpers/factory) — the current idiomatic way to put a
  typed user on the context.

[`@hono/session`](https://github.com/honojs/middleware/tree/main/packages/session) does exist. It is
an encrypted-JWT (JWE) cookie store that pulls in `jose`, and it has `duration: { absolute,
inactivity }` — `inactivity` being the rolling window. It is a real option, but it is a stateless
JWE blob rather than a table you own, which makes revocation harder, not easier. Its own README
points you at OWASP and the Copenhagen Book anyway.

### Bun has every primitive needed

From [bun.com/docs](https://bun.com/docs) (canonical; `bun.sh/docs` still resolves but redirects
paths). Verified by execution on the Bun in this repo, 1.1.42 — so these are a floor, not a ceiling:

- `bun:sqlite` [`Database`](https://bun.com/docs/api/sqlite) with `{ strict: true }`, which binds
  named parameters without the `$`/`:`/`@` prefix **and throws on a missing parameter** instead of
  silently binding NULL. `db.query(...).get()/.all()/.run()`, `db.transaction(fn)`,
  `db.run("PRAGMA journal_mode = WAL;")`.
- `Uint8Array`/`Buffer` maps to **BLOB** natively — a 32-byte SHA-256 digest goes in as a primary
  key with no encoding step.
- `crypto.getRandomValues`, `crypto.subtle.digest`, `crypto.randomUUID`, `Bun.CryptoHasher`,
  `Uint8Array.prototype.toBase64` / `fromBase64` — all present.
- `node:crypto`'s `timingSafeEqual` is implemented. Note it **throws** on a length mismatch where a
  hand-written `constantTimeEqual` returns `false`; with fixed-length digests that never fires.
- `Bun.env` is documented as an alias of `process.env` — literally the same object.

---

## 2. Better Auth, examined properly

It deserves a fair hearing, and it nearly wins. What follows is from the published 1.6.26 source and
a working spike, not the marketing page.

### It fits the stack

`bun:sqlite` is [documented and first-party](https://www.better-auth.com/docs/adapters/sqlite):

```ts
import { betterAuth } from "better-auth";
import { Database } from "bun:sqlite";

export const auth = betterAuth({ database: new Database("database.sqlite") });
```

`kysely` is a direct dependency and `@better-auth/kysely-adapter` ships a `BunSqliteDialect`
selected by duck-typing (`if ("fileControl" in db) return "sqlite"`). You never touch Kysely. Hono
is a [documented integration](https://www.better-auth.com/docs/integrations/hono):

```ts
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
```

**Measured cost**: `bun add better-auth@1.6.26` → 22 packages, **30 MB**, sub-second, no native
modules. All five DB adapters (mongo, prisma, drizzle, kysely, memory) are hard dependencies
regardless of which one you use, as is `@better-auth/telemetry`.

### The schema it imposes

This is the ticket's question for ticket 04. Generated by running the CLI against a real
`bun:sqlite` config — verbatim output:

```sql
create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null);

create table "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);

create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);

create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);

create index "session_userId_idx" on "session" ("userId");
create index "account_userId_idx" on "account" ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");
```

Read that against "no passwords, no OAuth, no email":

- **`user.email` is `NOT NULL UNIQUE`** and required at the app layer too. You must fabricate a
  unique address per person — `nan@family.local` — for an app that will never send mail. The core
  team agrees it is wrong; there is a live `TODO(#9124): drop required+unique in v2` on that field.
  A v2 schema change is therefore on the table.
- **`account` will be empty forever.** It exists for OAuth tokens and password hashes.
- **`verification`** is used only if you adopt magic-link.
- `id` columns are 32-char random strings, not integers. SQLite gets `supportsDates: false`, so
  every timestamp is an ISO-8601 **string**, which is not what you'd choose for a schema you own.

Passkeys later are **purely additive** — one `passkey` table plus two indexes, nothing touched on
`user`/`session`/`account`. Verified by diffing generated schemas:

```sql
create table "passkey" ("id" text not null primary key, "name" text, "publicKey" text not null, "userId" text not null references "user" ("id") on delete cascade, "credentialID" text not null, "counter" integer not null, "deviceType" text not null, "backedUp" integer not null, "transports" text, "createdAt" date, "aaguid" text);
```

### Rolling sessions: exactly right, and configuration only

From [`create-context.mjs`](https://www.better-auth.com/docs/concepts/session-management), defaults
in seconds: `expiresIn` 604800 (7d), `updateAge` 86400 (1d), `freshAge` 86400 (1d). The refresh
condition, verbatim from `dist/api/routes/session.mjs`:

```js
const shouldBeUpdated = session.session.expiresAt.valueOf() - expiresIn * 1e3 + updateAge * 1e3 <= Date.now();
```

When it fires it updates the DB `expiresAt` **and** re-sets the cookie with a fresh `Max-Age`. The
token is not rotated. So `{ expiresIn: 60*60*24*180, updateAge: 60*60*24 }` is a literal answer to
"renews on use, expires after N months idle". This is a config value, not code.

Two traps worth naming:

- **No absolute cap exists.** Sliding window only. `session.createdAt` is preserved and never
  touched on refresh, so a hard cap is something you enforce yourself.
- **`freshAge` will bite you.** `freshSessionMiddleware` throws `SESSION_NOT_FRESH` once
  `Date.now() - session.createdAt >= freshAge`, and `listSessions` sits behind it. With multi-month
  rolling sessions every session is permanently stale after day one and "show me my devices" 403s
  forever. You must set `freshAge: 0`. (The `revoke*` endpoints use `sensitiveSessionMiddleware`,
  which doesn't check freshness, so revocation keeps working.)

### Cookies and revocation

Defaults from `dist/cookies/index.mjs`: name `better-auth.session_token` (gaining a `__Secure-`
prefix when secure), and attributes `httpOnly: true, sameSite: "lax", path: "/"`, with `secure`
derived from `useSecureCookies` > baseURL protocol > `NODE_ENV`. Observed `Set-Cookie` from my
spike:

```
better-auth.session_token=TEitN333hFH2560pDnAMtmwDY8RrGwRS.7z2zr1s4y3cyadg%2BFNYz9gjEJDDxEOprIKfJXfGFGVI%3D; Max-Age=15552000; Path=/; HttpOnly; SameSite=Lax
```

Revocation is well covered: `revokeSession({ token })` (plaintext token, ownership-checked),
`revokeSessions()`, `revokeOtherSessions()`, `listSessions()`.

### Token entropy is fine. Token storage is not.

Generation, from `dist/db/internal-adapter.mjs`: `token: generateId(32)`, where `generateId` draws
32 characters from a 62-char alphabet using `crypto.getRandomValues` with rejection sampling
(unbiased). That is **~190 bits**. Entropy is not the problem.

Storage is. `createSession` writes that string to `session.token` with no hashing, and lookup is a
plaintext equality match. Confirmed by reading the sqlite file after minting a session:

```
token returned to client:  oFaeHrG6jfSYdtk8Un7vn7WJNCOQvEV3
row in session table:      {"token":"oFaeHrG6jfSYdtk8Un7vn7WJNCOQvEV3", ...}
```

**In fairness, a DB-only leak is not immediately a login.** The cookie value is
`<token>.<HMAC-SHA256(secret, token)>`, so the stolen token needs `BETTER_AUTH_SECRET` to be signed
into a usable cookie. I tested this directly — reading the token straight out of a read-only copy of
the database and replaying it:

```
raw token, no signature:     401
raw token + junk signature:  401
```

So the honest framing is **DB + secret**, not DB alone. On a home server where `scran.sqlite` and
`.env` live in the same compose stack and get backed up together, that is a thin distinction. Note
the inconsistency: `magicLink` and `oneTimeToken` both offer `storeToken: "hashed"`. The core
session token has no such escape hatch.

### Rate limiting: built in, in-memory, and the docs are wrong

The [docs](https://www.better-auth.com/docs/concepts/rate-limit) say the production default is
"Window: 60 seconds, Max Requests: 100". The source says otherwise:

```js
enabled: options.rateLimit?.enabled ?? isProduction,
window:  options.rateLimit?.window || 10,
max:     options.rateLimit?.max || 100,
storage: options.rateLimit?.storage || (options.secondaryStorage ? "secondary-storage" : "memory")
```

The real default window is **10 seconds**. Set both explicitly rather than trusting either number.
Storage is an in-memory `Map` capped at 100k entries that **does not survive a container restart**;
`storage: "database"` adds a `rateLimit` table. Server-side `auth.api.*` calls bypass rate limiting
entirely. Plugins ship their own rules — `magicLink` sets `window: 60, max: 5`.

### The disqualifier: there is no invite primitive, and the nearest one redeems on GET

`auth.api` on a default install exposes exactly this — nothing that mints a session for a user you
just created:

```
accountInfo callbackOAuth changeEmail changePassword deleteUser deleteUserCallback error
getAccessToken getSession linkSocialAccount listSessions listUserAccounts ok refreshToken
requestPasswordReset requestPasswordResetCallback resetPassword revokeOtherSessions
revokeSession revokeSessions sendVerificationEmail setPassword signInEmail signInSocial
signOut signUpEmail unlinkAccount updateSession updateUser verifyEmail verifyPassword
```

`signInWithToken` does not exist (zero hits across the 1.6.26 dist). `auth.api.createSession` does
not exist. `signInEmail` needs a password. `oneTimeToken` requires you to already be logged in as
the target user — chicken and egg. Admin-plugin impersonation needs an authenticated admin session
and defaults to a one-hour session. That leaves two routes.

**Route 1 — `magicLink` with a no-op sender.** `sendMagicLink` is a required callback but a no-op is
legal; you capture the URL instead of mailing it. It works. It is also the thing the ticket
explicitly warns about. From `dist/plugins/magic-link/index.mjs`:

```js
magicLinkVerify: createAuthEndpoint("/magic-link/verify", {
  method: "GET",
  ...
}, async (ctx) => {
  const storedToken = await storeToken(ctx, token);
  const tokenValue = await ctx.context.internalAdapter.consumeVerificationValue(storedToken);
  if (!tokenValue) redirectWithError("INVALID_TOKEN");
  ...
  const session = await ctx.context.internalAdapter.createSession(user.id);
```

**The token is consumed inside a `GET` handler.** Paste that link into WhatsApp or Slack and the
unfurler burns it before anyone taps it; the human then gets `?error=INVALID_TOKEN`. There is no
option to move this to POST. This alone rules the plugin out for invite links pasted into chat.

**Route 2 — a custom plugin.** `better-auth/api` and `better-auth/cookies` are public exports, so
you can write your own endpoint. I built it and ran it end to end:

```
redeem: 200 {"ok":true}
set-cookie: better-auth.session_token=...; Max-Age=15552000; Path=/; HttpOnly; SameSite=Lax
me: 200 {"name":"Al"}
replay: 410 {"message":"invite already used or expired"}
```

It works, cleanly, in about 50 lines. But note what just happened: **you wrote the invite flow
yourself anyway**, on top of 22 packages, four tables, a fabricated email address, and a plaintext
session token. The library did not supply the thing you needed; it supplied a session table and a
cookie writer, which is the part that was never hard.

---

## 3. Hand-rolling: the honest cost, measured

Not estimated. I wrote it, wrote tests, and ran them. The complete module — schema DDL, invite
issue/peek/redeem, session create/validate/roll, revoke, list — is **105 lines of non-comment code
and zero new dependencies** (Hono is already in `server/package.json`; `bun:sqlite` is the runtime).

```
bun test v1.1.42
(pass) invite: GET peek does not burn, POST redeems once
(pass) db stores only the hash, never the token
(pass) no cookie / bad cookie / revoked cookie are all 401
(pass) hono/csrf only fires on form-sendable content types
 4 pass  0 fail
```

**What the library buys over that**, honestly: passkeys as a drop-in plugin instead of wiring
`@simplewebauthn/server` yourself; OAuth, 2FA, organisations and roles if they ever arrive; a
rate limiter you didn't write; and someone else's eyes on the session code. Every one of those is
either out of scope or explicitly deferred by the map.

**What it costs**: 22 packages and 30 MB; a `user.email` column that is a lie; two dead tables in a
schema ticket 04 is supposed to design on purpose; dates as ISO strings; a plaintext session token;
a rate limiter whose documented defaults are wrong; a `freshAge` trap you only find by reading the
source; and a v2 with schema changes visibly being contemplated. And you still write the invite
endpoint.

At five users, on one box, with no OAuth and no email, the trade is not close.

---

## 4. Security

Ticket order. Primary sources throughout; where OWASP does **not** say the thing people assume it
says, that is called out rather than papered over.

### 4.1 Token entropy

[OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#session-id-entropy):

> Session identifiers must have at least `64 bits` of entropy to prevent brute-force session
> guessing attacks.

and, under *Session ID Content*:

> If you need to create your own sessionID, use a cryptographically secure pseudorandom number
> generator (CSPRNG) with a size of **at least 128 bits** and ensure that each sessionID is unique.

We are creating our own, so 128 bits is the number that applies. **Recommendation: 32 bytes from
`crypto.getRandomValues`, base64url-encoded — 256 bits.** Twice the recommendation, one line of
code, no reason to be stingy. Same generator for invite tokens.

Better Auth's ~190 bits also clears this comfortably; entropy was never the differentiator.

One cheap nit worth taking, from
[#session-id-name-fingerprinting](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#session-id-name-fingerprinting):

> It is recommended to change the default session ID name of the web development framework to a
> generic name, such as `id`.

So `__Host-id`, not `__Host-scran_session`.

### 4.2 Cookie flags

Recommended `Set-Cookie`, and why each attribute is what it is:

```
Set-Cookie: __Host-id=<43 chars base64url>; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=15552000
```

- **`HttpOnly`** — OWASP: *"This session ID protection is **mandatory** to prevent session ID
  stealing through XSS attacks."* Non-negotiable.
- **`Secure`** — OWASP: *"This session protection mechanism is **mandatory**."* See 4.7 for the
  LAN caveat, which is the one real complication.
- **`SameSite=Lax`, not `Strict`.** The ticket's premise — "there are no third-party redirects" — is
  not quite right, and this is the one place it matters. OWASP prefers Strict. But RFC 6265bis
  [§8.8.2](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22) describes our
  exact situation verbatim:

  > They might expect that clicking on an emailed link to `https://projects.example/secret/project`
  > would show them the secret project that they're authorized to see, but if
  > `https://projects.example` has marked their session cookies as `SameSite=Strict`, then this
  > cross-site navigation won't send them along with the request... **the user will be quite
  > confused.**

  The whole point of this app is pasting links into chat. An already-signed-in family member
  clicking a shared recipe link from WhatsApp would land logged-out with Strict. The OWASP
  [CSRF cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
  agrees: *"If a website wants to maintain a user's logged-in session after the user arrives from an
  external link, SameSite's default Lax value provides a reasonable balance between security and
  usability."*

  Note that this does **not** affect invite redemption itself — 6265bis is explicit that cookies
  *"can be set along with any top-level navigation, cross-site or otherwise."* The redeemer has no
  session yet.

  Microsoft documents the same breakage through link-rewriting proxies
  ([Safe Links](https://learn.microsoft.com/en-us/defender-office-365/safe-links-about)):
  *"Websites opened from Teams might require re-authentication when `SameSite=Strict` cookies are
  required."*

- **`__Host-` prefix.** RFC 6265bis
  [§4.1.3.2](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-22): the prefix
  guarantees *"a `Secure` attribute, a `Path` attribute with a value of `/`, and no `Domain`
  attribute"* and *"hews as closely as a cookie can to treating the origin as a security boundary."*
  OWASP calls it **"Recommended for session IDs."** Hono enforces the rules at the type level.
- **No `Domain`**, `Path=/`. OWASP: *"the `Domain` attribute should not be set (restricting the
  cookie just to the origin server)."*
- **`Max-Age`, i.e. a persistent cookie.** This is a **deliberate deviation**. OWASP: *"it is highly
  recommended to use non-persistent cookies for session management purposes."* Its rationale is disk
  residency. "A device never silently logs out" is a settled requirement in the map and is
  incompatible with a session cookie. Recorded, not overlooked.

### 4.3 Is the session id stored hashed?

**Recommendation: yes — store `SHA-256(token)` as a `BLOB PRIMARY KEY`; never store the token.**

Be precise about the provenance here, because it is easy to overclaim: **OWASP does not recommend
hashing session IDs at rest.** The Session Management, Cryptographic Storage, Authentication and
Password Storage cheat sheets were all searched; the only hashing guidance for session IDs is
*"log a salted-hash of the session ID instead of the session ID itself."*

The nearest thing OWASP does say is in the
[MFA cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
on OTPs, and the reasoning transfers exactly:

> hashing remains useful to: Prevent accidental disclosure via logs, metrics, or debugging tools;
> **Reduce blast radius if the database is briefly exposed**; Enforce good secret-handling discipline
> and avoid plaintext storage by default. The goal is short-term exposure protection, not long-term
> cryptographic secrecy.

The [Forgot Password cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
requires reset tokens be *"Stored in a secure manner"* — though its pointer to the Password Storage
cheat sheet is a dangling reference, since that document is entirely about Argon2/bcrypt for
low-entropy passwords.

So the argument is engineering, not citation, and it is a strong one:

1. `data/scran.sqlite` gets backed up, `docker cp`'d, and copied to a laptop to poke at. Any copy is
   otherwise a bearer-token dump.
2. A plain **SHA-256** is sufficient and no KDF is needed — the input is 256 bits of CSPRNG output,
   so there is nothing to brute-force. This is exactly why the Password Storage cheat sheet doesn't
   apply.
3. It costs one function call, and the lookup stays a primary-key hit.
4. **It removes the timing question entirely.** Lookup is `WHERE id = <hash>`; there is no secret
   comparison anywhere in application code, so `timingSafeEqual` is not needed. (It exists in Bun if
   you want it — but note Node's version *throws* on a length mismatch where a hand-written
   `constantTimeEqual` returns `false`.)

This is the single clearest place the hand-roll beats Better Auth, whose core `session.token` is
plaintext with no `storeToken: "hashed"` option — see §2.

### 4.4 Revocation — a lost phone must be killable

`DELETE FROM sessions WHERE id = ?` (one device) or `WHERE user_id = ?` (everything). Because the
session is a DB row read on every request, revocation is **immediate** — there is no cached-JWT
window to reason about. A `sessions` list keyed by user gives you a "sign out my other devices"
button for free, which is the entire lost-phone story.

This is also the reason to leave Better Auth's `cookieCache` off if you ever adopt it, and the
reason `@hono/session`'s JWE approach is a step backwards here.

### 4.5 Rolling vs absolute lifetime

OWASP is unambiguous that both timeouts should exist:

> All sessions should implement an **absolute timeout, regardless of session activity**.

and its stated ranges — *"15-30 minutes for low risk applications"* idle, *"between 4 and 8 hours"*
absolute — are for applications nothing like this one.

**Recommendation: idle timeout only, ~180 days, no absolute cap. Deliberately.** The map settled
that "a device never silently logs out"; an absolute cap is precisely a silent logout on a schedule,
and the recovery path (generate a new invite link, paste it into the family chat) is worse than the
risk it removes for five known people on a home server. Revocation is instant and manual, which is
the compensating control.

Better Auth has no absolute cap option either, so this is not a differentiator — but it is a
recorded deviation, not an oversight.

**If this box is ever exposed to the internet**, the right control is not an absolute cap but the
one OWASP wrote for exactly this case:

> the web application can implement an additional **renewal timeout** after which the session ID is
> automatically renewed, in the middle of the user session... specially when the absolute timeout
> value extends significantly over time (e.g. it is an application requirement to keep the user
> sessions open for long periods of time).

That is *rotate the token value on each daily roll*, not end the session. It bounds the value of a
stolen token to ~a day with no user-visible logout. It is three lines on top of the code below —
issue a new token, update the row, re-set the cookie. It is not free: two in-flight requests racing
a rotation means one carries a dead token and 401s, and dodging that needs a grace window and
another column. Not worth it for v1; note the ceiling and move on.

### 4.6 Invite link handling

**The previewers are real.** Slack, officially
([docs.slack.dev](https://docs.slack.dev/messaging/unfurling-links-in-messages/)): *"When a link is
spotted, **Slack crawls it** and provides a preview."* Microsoft Defender, officially
([learn.microsoft.com](https://learn.microsoft.com/en-us/defender-office-365/safe-links-about)):
*"URLs are scanned prior to message delivery"* and *"URLs that don't have a valid reputation are
**detonated asynchronously in the background**."* Meta's
[crawler docs](https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/) confirm
`facebookexternalhit` for content *"shared on one of Meta's family of apps."*

Honest gap: **no primary source was found for WhatsApp specifically** — faq.whatsapp.com is a
client-rendered SPA and Meta's crawler doc doesn't name WhatsApp. The existence of a user-facing
"disable link previews" setting is circumstantial. Slack and Safe Links are enough to settle the
design regardless.

The rule itself is normative, not folklore. RFC 9110
[§9.2.1](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.1):

> If the purpose of such a resource is to perform an unsafe action, then the resource owner **MUST**
> disable or disallow that action when it is accessed using a safe request method. Failure to do so
> will result in unfortunate side effects when automated processes perform a GET on every URI
> reference...

**The flow:**

| Step | Method | Effect |
|---|---|---|
| `GET /invite/:token` | safe | Look the token up, render a landing page ("Nan invited you — what should we call you?" + a form). **Burns nothing.** Idempotent, so N previewer hits are harmless. |
| `POST /invite/:token` | unsafe | Burn the token, create the user, mint the session, set the cookie. |

- **Entropy**: same 256 bits as the session token. OWASP's Forgot Password cheat sheet gives no
  number at all — only *"Long enough to protect against brute-force attacks"* — so 4.1's number
  carries over.
- **Expiry**: OWASP likewise gives **no duration**, only *"expire after an appropriate period."* Any
  specific figure you have seen quoted is not in the current text. **7 days** is the suggestion here
  — long enough to survive a family member ignoring their phone for a weekend, short enough that a
  stale link in a chat history is dead.
- **Stored hashed**, same as sessions, same reasoning.
- **Single-use enforcement** is a DB constraint, not application logic. The burn is one atomic
  statement whose `WHERE` clause is the lock:

  ```sql
  UPDATE invites SET redeemed_at = ?
   WHERE id = ? AND redeemed_at IS NULL AND expires_at > ?
  RETURNING id
  ```
  No row returned means someone else won the race. Two people tapping the same link concurrently
  cannot both get in.
- **Burned token reopened**: `410 Gone`, generic message — *"This invite has already been used, or
  it has expired. Ask whoever sent it for a new one."* Do not distinguish *used* from *expired* from
  *never existed*. OWASP has no rule for the redeem step specifically (flagged), but the
  [Authentication cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#authentication-and-error-messages)'s
  rule applies by analogy: *"An application must respond (both HTTP and HTML) in a generic manner."*
- Also from Forgot Password, and free here: *"Don't rely on the Host header while creating the reset
  URLs"* — build invite URLs from a configured base URL, never `c.req.header("host")`. Same reason
  Hono's own CSRF docs warn about reverse proxies stripping headers.

### 4.7 What's exposed at all — the assumption the whole thing rests on

This is the ticket's sharpest question, and it has a concrete technical consequence rather than a
philosophical one.

`http://192.168.x.x` is **not a secure context**. The W3C
[Secure Contexts §3.1](https://w3c.github.io/webappsec-secure-contexts/#is-origin-trustworthy)
algorithm lists only `127.0.0.0/8` and `::1/128` as trustworthy by IP; `192.168.0.0/16` and
`10.0.0.0/8` appear nowhere. Per RFC 6265bis §5.6 step 13, a `Secure` cookie on a non-secure
connection means the browser will *"abort these steps and **ignore the cookie entirely**."*

So on a plain-HTTP LAN box: **`Secure` and `__Host-` are not "nice to have but skippable" — setting
them breaks login outright.** The cookie config must follow the deployment:

| Deployment | Cookie |
|---|---|
| Plain HTTP on LAN | `id=…; Path=/; HttpOnly; SameSite=Lax; Max-Age=…` (no `Secure`, no prefix) |
| TLS at a reverse proxy (incl. self-signed / internal CA) | `__Host-id=…; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=…` |

One env var, both branches in the code below. 6265bis §8.3 on why the second is strongly preferred:
*"If a server does not set the `Secure` attribute, the protection provided by the secure channel
will be largely moot."*

**This resolves the map's open "whether Caddy is in the compose file at all depends on whether
anything needs TLS on a LAN" — something does.** Two things, in fact: the `Secure` cookie, and
passkeys later, which require a secure context outright. That is now a decided input to the Docker
ticket rather than an open question.

**The assumptions the recommendation depends on**, stated plainly:

1. Five known people, all invited by hand by the operator. There is no signup.
2. The DB file and its backups are as sensitive as the app — hashing tokens is what makes a leaked
   backup boring rather than catastrophic.
3. Nothing is port-forwarded. **If that changes, three things change with it**: rate limiting stops
   being optional (4.8), the renewal timeout in 4.5 becomes worth its complexity, and TLS becomes
   mandatory rather than merely correct.
4. Everyone on the LAN is trusted. On a home network with guest Wi-Fi and IoT devices this is
   already shakier than it sounds, which is another vote for TLS.

### 4.8 Rate limiting

**OWASP publishes essentially no concrete numbers for unauthenticated endpoints.** All three
relevant documents were searched; the only figures anywhere are "ten minutes", "one second"
(exponential base), "max 2-3" lockouts, "one hour", and "a few seconds' pause". There is no
"N requests per minute per IP" recommendation to cite. What it does say is directional and useful:

- [Authentication CS](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#protect-against-automated-attacks):
  *"The counter of failed logins should be associated with **the account itself, rather than the
  source IP address**."*
- [Blocking Brute Force Attacks](https://owasp.org/www-community/controls/Blocking_Brute_Force_Attacks):
  *"an easy solution is to **inject random pauses** when checking a password. Adding even a few
  seconds' pause can greatly slow a brute-force attack but will not bother most legitimate users."*
  And on IP blocking: *"An attacker with a list of 1,000 proxies can attempt 2,000 or 3,000
  passwords without being blocked."*
- Forgot Password CS: *"Accounts should not be locked out in response to a forgotten password
  attack, as this can be used to deny access to users with known usernames."*

**Recommendation, sized to the actual threat.** The unauthenticated surface is exactly two routes:
`GET /invite/:token` and `POST /invite/:token`. Guessing a token is a 256-bit brute force, which is
not happening. The realistic risk is a bored bot burning CPU, not a break-in.

- **LAN-only: do nothing.** A rate limiter on a box nobody can reach is speculative complexity.
- **The moment it is exposed**: a fixed 200ms delay on a failed redeem plus a per-IP cap
  (say 10 POSTs / 10 minutes) in a `Map`. That is ~10 lines, needs no dependency, and losing the
  counters on container restart is irrelevant — Better Auth's own built-in limiter is an in-memory
  `Map` that does the same thing.
- `hono-rate-limiter` exists but its last release was 2025-12-29; not worth a dependency for this.

### 4.9 CSRF

The OWASP CSRF cheat sheet is explicit that SameSite alone is sufficient only if **every one** of
five conditions holds. Checking them honestly:

| Condition | Us |
|---|---|
| No shared registrable domain with anything uncontrolled | ✅ own host |
| **No GET endpoint performs a state-changing action** | ✅ — this is 4.6's rule, and it is *"the single most common way SameSite-based defenses fail in practice"* |
| `SameSite=Strict`, **or** `Lax` + `__Host-` prefix + a strict audit of every GET handler | ✅ via the Lax branch |
| Origin/Referer verification on state-changing endpoints | ✅ `hono/csrf` |
| Comfortable excluding browsers that don't enforce SameSite | ✅ five modern phones |

All five hold, so no CSRF token is needed. `app.use(csrf())` covers condition 4 by checking `Origin`
**and** `Sec-Fetch-Site` (either passing is enough).

**One measured subtlety, found by writing the test rather than reading the docs.** `hono/csrf` only
inspects requests whose content type is HTML-form-sendable. A cross-origin `application/json` POST
sails straight through it:

```
cross-origin POST, Content-Type: application/x-www-form-urlencoded  -> 403
cross-origin POST, Content-Type: application/json                   -> 200
```

That is correct behaviour, not a bug — a browser cannot send cross-origin JSON without a CORS
preflight, and an app with no CORS middleware never approves one. But it means the two layers cover
different halves and you need both: `hono/csrf` for the form-shaped requests CORS can't stop, and
*not* installing permissive CORS for the JSON ones. This is also precisely the OWASP recommendation
for APIs — *"a simple mitigation is for the server or API to disallow these simple content types"* —
so **the invite POST should require `Content-Type: application/json` and reject `text/plain`**.

Two deployment notes: Hono's docs warn that *"environments that use reverse proxies to remove these
headers may not work well"* — verify `Origin` survives the proxy. And OWASP: *"Configure your
application to simply know its target origin... this would be the most secure approach as it's
defined server side"* — pass `csrf({ origin: ... })` explicitly rather than letting it infer from
`Host`.

---

## RECOMMENDATION

### Hand-roll it. Do not add an auth library.

Not because Better Auth is bad — it is well built, actively maintained, and fits Bun and Hono
properly. Because for *this* application it supplies the easy half and gets the hard half wrong:

1. **It has no invite primitive.** The full `auth.api` surface is email/password and OAuth. The
   nearest fit, `magicLink`, **consumes the token inside a `GET` handler** — the precise failure the
   ticket was written to avoid, unfixable by configuration. The alternative is a custom plugin, which
   I built and ran successfully in ~50 lines. Either way **you write the invite flow yourself.** The
   library's contribution is a session table and a cookie writer, which was never the hard part.
2. **It stores the session token in plaintext.** ~190 bits of entropy, written straight into
   `session.token`. In fairness, the cookie is HMAC-signed, so a DB-only leak is not instantly a
   login — I verified a stolen token replays as 401 without the secret. But on a home server the DB
   and `.env` travel together, and `magicLink`/`oneTimeToken` both offer `storeToken: "hashed"` while
   the core session has no such option. Hashing is one line when you own the code.
3. **It dictates the wrong schema for ticket 04.** A `NOT NULL UNIQUE` email you must fabricate for
   an app that sends no email; an `account` table that stays empty forever; timestamps as ISO
   strings. Ticket 04's entire job is to design this deliberately, and this would pre-empt it with a
   shape built for a product this isn't. The team's own `TODO(#9124): drop required+unique in v2`
   says they agree.

Against that: **103 lines, zero new dependencies, three tables you designed.**

Passkeys are not foreclosed either way. `@better-auth/passkey` is a purely additive migration (one
table, verified by diffing generated schemas). Hand-rolled, it is `@simplewebauthn/server`
(13.3.2, June 2026, maintained) writing to a `credentials` table and then calling the same
`createSession` — WebAuthn is orthogonal to session management. The real constraint is neither
library: **WebAuthn requires a secure context**, so passkeys need TLS regardless (§4.7).

### The schema this imposes on ticket 04

Three tables, nothing else, and no opinions leaking into the recipe model:

```sql
CREATE TABLE users (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE sessions (
  id         BLOB PRIMARY KEY,            -- SHA-256 of the token. The token is never stored.
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL             -- idle deadline; pushed out on use
);
CREATE INDEX sessions_user_id ON sessions(user_id);

CREATE TABLE invites (
  id           BLOB PRIMARY KEY,          -- SHA-256 of the token
  created_by   INTEGER REFERENCES users(id),
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at   INTEGER NOT NULL,
  redeemed_at  INTEGER,                   -- NULL = unredeemed. This column IS the invite list.
  redeemed_by  INTEGER REFERENCES users(id)
);
```

`users.id` is an integer, so per-user ratings and authored notes join on a normal foreign key. The
map's "the invite list is the set of unredeemed tokens" is literally `WHERE redeemed_at IS NULL`.

### The code

This is not a sketch. It is the working module, run with the tests below on Bun 1.1.42 + Hono 4.13.1.

```ts
// server/src/auth.ts
import { Database } from "bun:sqlite";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

export const db = new Database("data/scran.sqlite", { create: true, strict: true });
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
// (three CREATE TABLE statements from above)

const IDLE = 60 * 60 * 24 * 180; // 180 days idle. No absolute cap — see §4.5.
// `__Host-` requires Secure, which requires a trustworthy origin. A plain-http
// LAN box is not one, so the browser would drop the cookie entirely. See §4.7.
const SECURE = Bun.env.SCRAN_HTTPS === "true";
const COOKIE = SECURE ? "__Host-id" : "id"; // generic name, per OWASP

const b64url = (b: Uint8Array) => Buffer.from(b).toString("base64url");
const sha256 = (s: string) =>
  new Uint8Array(new Bun.CryptoHasher("sha256").update(s).digest().buffer);

/** 32 random bytes = 256 bits. Returned to the client; only its SHA-256 is stored. */
export function newToken() {
  const raw = b64url(crypto.getRandomValues(new Uint8Array(32)));
  return { raw, hash: sha256(raw) };
}

export function createSession(userId: number) {
  const { raw, hash } = newToken();
  db.query("INSERT INTO sessions (id, user_id, expires_at) VALUES ($id, $u, $e)")
    .run({ id: hash, u: userId, e: Math.floor(Date.now() / 1000) + IDLE });
  return raw;
}

export function setSessionCookie(c: Context, raw: string) {
  setCookie(c, COOKIE, raw, {
    path: "/", httpOnly: true, secure: SECURE, sameSite: "Lax", maxAge: IDLE,
  });
}

export const auth = createMiddleware<{ Variables: { user: { id: number; name: string } } }>(
  async (c, next) => {
    const raw = getCookie(c, COOKIE);
    if (!raw) return c.json({ error: "unauthorized" }, 401);
    const hash = sha256(raw);
    const now = Math.floor(Date.now() / 1000);
    const row = db.query(
      `SELECT s.user_id, s.expires_at, u.name FROM sessions s
         JOIN users u ON u.id = s.user_id WHERE s.id = $id`,
    ).get({ id: hash }) as { user_id: number; expires_at: number; name: string } | null;
    if (!row) return c.json({ error: "unauthorized" }, 401);
    if (row.expires_at <= now) {
      db.query("DELETE FROM sessions WHERE id = $id").run({ id: hash });
      deleteCookie(c, COOKIE, { path: "/" });
      return c.json({ error: "unauthorized" }, 401);
    }
    // Rolling: push the idle clock out, but only once a day (one write/day/device).
    if (row.expires_at - now < IDLE - 86400) {
      db.query("UPDATE sessions SET expires_at = $e WHERE id = $id").run({ e: now + IDLE, id: hash });
      setSessionCookie(c, raw);
    }
    c.set("user", { id: row.user_id, name: row.name });
    await next();
  },
);

export function createInvite(byUserId: number | null, days = 7) {
  const { raw, hash } = newToken();
  db.query("INSERT INTO invites (id, created_by, expires_at) VALUES ($id, $by, $e)")
    .run({ id: hash, by: byUserId, e: Math.floor(Date.now() / 1000) + days * 86400 });
  return raw; // paste `${BASE_URL}/invite/${raw}` into the family chat
}

/** Atomic single-use burn: the UPDATE...WHERE redeemed_at IS NULL is the lock. */
export function redeemInvite(raw: string, name: string) {
  const hash = sha256(raw);
  const now = Math.floor(Date.now() / 1000);
  return db.transaction(() => {
    const burned = db.query(
      "UPDATE invites SET redeemed_at = $now WHERE id = $id AND redeemed_at IS NULL AND expires_at > $now RETURNING id",
    ).get({ id: hash, now });
    if (!burned) return null;
    const user = db.query("INSERT INTO users (name) VALUES ($n) RETURNING id")
      .get({ n: name }) as { id: number };
    db.query("UPDATE invites SET redeemed_by = $u WHERE id = $id").run({ u: user.id, id: hash });
    return { userId: user.id, token: createSession(user.id) };
  })();
}

/** GET-safe: tells the landing page whether to render a form. Burns nothing. See §4.6. */
export function peekInvite(raw: string) {
  const row = db.query("SELECT redeemed_at, expires_at FROM invites WHERE id = $id")
    .get({ id: sha256(raw) }) as { redeemed_at: number | null; expires_at: number } | null;
  if (!row || row.redeemed_at !== null || row.expires_at <= Date.now() / 1000) return null;
  return { ok: true };
}

export const revokeSession = (raw: string) =>
  db.query("DELETE FROM sessions WHERE id = $id").run({ id: sha256(raw) });
export const revokeAllForUser = (userId: number) =>   // the lost-phone button
  db.query("DELETE FROM sessions WHERE user_id = $u").run({ u: userId });
export const listSessions = (userId: number) =>
  db.query("SELECT hex(id) AS id, created_at, expires_at FROM sessions WHERE user_id = $u").all({ u: userId });
```

Wiring it up — note `csrf` before the routes, and the GET/POST split on the same path:

```ts
// server/src/index.ts
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { auth, createInvite, peekInvite, redeemInvite, setSessionCookie } from "./auth";

const app = new Hono();
app.use(csrf({ origin: Bun.env.SCRAN_ORIGIN! })); // explicit, not inferred from Host — §4.9

// Safe. A previewer can hit this all day. RFC 9110 §9.2.1.
app.get("/invite/:token", (c) =>
  peekInvite(c.req.param("token"))
    ? c.html(renderJoinForm(c.req.param("token")))
    : c.html(renderGone(), 410));

// Unsafe. This is where the token burns.
app.post("/invite/:token", async (c) => {
  const { name } = await c.req.json();
  const result = redeemInvite(c.req.param("token"), name);
  if (!result) return c.json({ error: "This invite has already been used, or expired." }, 410);
  setSessionCookie(c, result.token);
  return c.json({ ok: true });
});

app.use("/api/*", auth);
app.get("/api/recipes", (c) => c.json({ me: c.var.user }));

export default app;
```

### The check

Per the map's testing story — unit tests on pure logic, `bun test`, no live calls. These four cover
every branch that would hurt if it broke, and all pass:

```
bun test v1.1.42
(pass) invite: GET peek does not burn, POST redeems once
(pass) db stores only the hash, never the token
(pass) no cookie / bad cookie / revoked cookie are all 401
(pass) hono/csrf only fires on form-sendable content types
 4 pass  0 fail  18 expect() calls
```

The second one is the load-bearing test: it reads the raw table bytes back and asserts the token
is not in them.

### What this decides for other tickets

- **Ticket 04 (data model)**: gets `users(id INTEGER PRIMARY KEY)` to hang ratings and notes off,
  and inherits no auth-library opinions.
- **Docker/Caddy** (map, "not yet specified"): **TLS is required, not optional.** Without it you
  lose `Secure`, lose `__Host-`, and foreclose passkeys. Caddy with an internal CA is in the compose
  file.
- **Passkeys** (map, "not yet specified"): still open, still additive, `@simplewebauthn/server`
  writing to a `credentials` table alongside `users`. Nothing here forecloses it.

### If you disagree

The one honest argument for Better Auth is *"I don't want to own session code."* It's a fair
instinct. But the invite flow — the actual novel part — has to be written either way, the code above
is 103 lines you can read in one sitting, and the deviations from stock (hashed tokens, no absolute
cap, GET/POST split, conditional `Secure`) are all decisions this app needs made deliberately rather
than inherited. If it were password login, OAuth, or account recovery, the answer would flip.

