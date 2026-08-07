# How do invite-only accounts and rolling sessions get built on Bun + Hono?

Type: research
Status: resolved

## Question

> **The premise below changed after the research ran.** It was written assuming device-trust with
> no accounts and no passwords. The human's call — recorded in the Answer — is that people get
> **real accounts** via invitation-based registration. The research findings all still stand; the
> conclusion they point at moved. Read the Answer, not just the question.

The auth model is settled (see the map): single-use invite links, no passwords, no email sending,
no OAuth. What isn't settled is what to build it *on*. Find out, against primary sources:

- **What auth libraries actually work on Hono + Bun + SQLite today?** Better Auth, Lucia, Hono's
  own middleware, or hand-rolled. For each: does it support a passwordless, token-redemption flow
  without an email provider bolted on, or does it assume email/OAuth and fight you?
- **What schema does the winner impose?** Ticket 04 designs the data model, and an auth library
  that ships its own `user`/`session` tables dictates part of that model. Report the tables.
- **Rolling sessions**: how does the candidate express "cookie renews on every request, expires
  only after N months of no use"? Is it a config value or something to write?
- **Hand-rolling cost.** Be honest about it. A single-use token table, a `Set-Cookie` with a
  signed session id, and a middleware is not much code. Say what a library buys over that —
  and what it costs (dependency, migrations, its opinions).
- **Passkeys as a later upgrade.** Does the candidate support WebAuthn without a rewrite? This is
  fog, not scope — the question is only whether choosing X now forecloses it.

**Security is a first-class constraint here, not a footnote.** The stated goal is that randoms
never get in. Answer these specifically:

- **Session hardening.** Cookie flags (`HttpOnly`, `Secure`, `SameSite` — which value, given there
  are no third-party redirects), token entropy, whether the session id is stored hashed so a DB
  leak isn't a login, and how a session gets **revoked** (a lost phone must be killable).
- **Rolling vs absolute lifetime.** Rolling extends the *idle* clock. Is there an absolute cap on
  top, and what does the candidate library do by default?
- **Invite link handling.** Link previewers (WhatsApp, Slack, mail scanners) will GET the invite
  URL before a human ever taps it. Redemption must not happen on GET. What's the correct flow —
  landing page on GET, redeem on POST? Token entropy, expiry, single-use enforcement, and what
  happens when a burned token is opened again.
- **Rate limiting** on redemption and any other unauthenticated endpoint.
- **What's exposed at all.** If the box is LAN-only the threat model is nearly empty; the moment
  it isn't, it isn't. Say which assumptions the recommendation depends on.

Answer with a recommendation and the reasoning, not a survey.

## Answer

**Invitation-based registration, on Better Auth, with passkeys as a second credential.** Full
research findings and citations: [research/01-auth-and-sessions.md](../research/01-auth-and-sessions.md).

The flow — the standard one, as used by Slack, Linear, Notion and GitHub org invites:

1. You create an invite. The server stores a **hash** of the token, an expiry, and (optionally) the
   email it's bound to. The set of unredeemed invites **is** the allow-list; nobody else can sign up.
2. You send the link however you like — WhatsApp, text. No mail provider, ever.
3. The link opens a **signup form**, not an account. `GET` renders; **`POST` redeems** — so a link
   previewer fetching the URL cannot consume the invite. This is the single most important detail
   in the design.
4. They create an account: **email + password**. The invite token is consumed atomically.
5. **Every login after that is ordinary email + password.** Once signed in on a device they can
   **add a passkey**, which becomes the day-to-day login — Face ID and in.

**Why an account rather than a trusted device** (the original recommendation, now superseded): an
account outlives any single device. New phone, borrowed laptop, wiped browser — they sign in.
Device-trust makes every one of those a support call to you.

**Why Better Auth, reversing the research's conclusion.** The research rejected it on two grounds,
and this design removes both: there is **no magic link** here (the invite token gates a form; Better
Auth never sees it), and the `NOT NULL UNIQUE` email it forces is now **real data we want**, not a
fabricated column. What's left is exactly what it's good at — password hashing, session management,
rate limiting, and a WebAuthn plugin for step 5. v1.6.26, first-class Hono integration, first-party
`bun:sqlite` dialect. The invite table stays ours: a thin layer on top, which the research proved
takes ~50 lines either way.

**Passkeys are out of scope for this map, and the reason is structural.** WebAuthn binds a
credential to a hostname, and **an IP address is not a valid one** — so on a LAN box reached at
`192.168.x.x` passkeys are impossible, certificate or not. The deploy hostname is settled
(`recipes.alastair.sh`, Cloudflare DNS) but doesn't exist until the public deploy, so **step 5
lands in the next map**. Chosen deliberately rather than drifted into: because the name is fixed in
advance, passkeys will enrol once and survive.

For this map that leaves **email + password as the only credential** — which is also the durable
one. With no mail provider a forgotten password is reset by hand: acceptable at five users, and
worth saying out loud rather than discovering.

**One thing this map must get right for the deploy to be a config change**: `Secure` cookies
require a secure context, which `http://192.168.x.x` is not. So the cookie flags and the base URL
are **env-driven** — off on the LAN, on in public, one variable, no code edit. That's ticket 05's
concern.

**Findings that survive unchanged:**

- **Lucia is dead** — deprecated March 2025, last publish 2024-10-20. Not a candidate.
- **Rolling sessions are config**, and extend the DB row *and* the cookie. **No absolute cap** — one
  would contradict "a device you cook from monthly never logs out". OWASP's *renewal timeout*
  (rotate the token, keep the session) is the upgrade if this ever faces the internet.
- **`SameSite=Lax`, not `Strict`** — RFC 6265bis §8.8.2 describes following a shared link from a chat
  app as the documented `Strict` breakage.
- **Caddy is required, not optional**: `http://192.168.x.x` is not a secure context per W3C, so
  `Secure` and `__Host-` cookies are silently dropped.
- **`hono/csrf` skips `application/json` entirely** (correct — CORS covers it — but both layers are
  needed, and `text/plain` should be rejected). Found by testing, not reading.
- Better Auth's **documented 60s rate-limit window is actually 10s** in the source.
- Better Auth stores its session token **in plaintext** (`session.token`, no `storeToken: "hashed"`).
  Verified that a DB-only leak replays as 401 — it's DB **+** secret, not DB alone. Accepted, since
  the alternative is hand-rolling sessions to fix one property.

**Honest gaps, flagged rather than papered over**: no primary source confirms WhatsApp fetches links
for previews (Slack and Microsoft Safe Links both do, officially) — the GET-redemption rule is
argued from general behaviour, not a citation. And **OWASP nowhere recommends hashing session IDs at
rest**; that argument is reasoning by analogy to its OTP guidance, and is labelled as such.

**Left for ticket 04**: Better Auth's `user` / `session` / `account` tables land in the data model
as given, plus our own `invites` table.
