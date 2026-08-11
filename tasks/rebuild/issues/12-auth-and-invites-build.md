# Build auth, invites and the invite command

Type: task
Status: resolved
Assignee: alastair
Blocked by: 11

## Question

Ticket 01 decided this; build it. Better Auth 1.6.26 with its `bun:sqlite` dialect and first-class
Hono integration, email + password only — no passkeys, no magic links, no mail provider.

- Better Auth mounted at `/api/auth/*`, its four tables migrated by **its** CLI, cookie flags and
  base URL driven by `COOKIE_SECURE` and `BASE_URL` from config.
- Rolling sessions, no absolute cap, `SameSite=Lax`.
- The `invite` table is ours (ticket 04): token **hash**, optional email, expiry, nullable
  `createdByUserId`, redemption fields.
- The invite flow's one critical detail: **`GET` renders the signup form, `POST` redeems it**, so a
  link previewer in a chat app cannot burn an invite. The token is consumed atomically with account
  creation.
- `bun run invite [email]` — creates an invite and prints the signup URL. This is the only way to
  create one for now; an `/invites` page is additive later.
- The auth middleware that sets `c.set('user')`, and the 401 path through ticket 07's
  `ClientError.unauthorised`.
- Integration tests that sign up through the real invite-and-signup route — the fixture every later
  test file uses to get a session.

`hono/csrf` and CORS both need configuring; ticket 01's research found `hono/csrf` skips
`application/json` entirely, and that `text/plain` bodies should be rejected.

Done when the invite command prints a link, that link creates exactly one account, a second attempt
with the same link fails, and a signed-in session survives a server restart.

## Answer

**Built as specified.** `better-auth@1.6.26` on the `bun:sqlite` database, `auth.ts` holding the
instance plus the invite layer, two routes in `http/invites.ts`, `bun run invite [email]`, and 39
tests green. All four done-when conditions were checked end to end against a real server on a file
database, not just through `app.request`: the command prints a link, two GETs of it burn nothing,
the POST creates exactly one account and returns a session cookie, the second POST 404s, and the
session still resolves after the process is killed and restarted.

### What the ticket did not settle, and how it was settled

- **Better Auth's four tables are created by its own migrator, called at boot** — `getMigrations`
  from `better-auth/db/migration`, the same function its CLI wraps, run once in `index.ts`. The
  ticket said "migrated by **its** CLI", which would mean a manual step before every fresh
  database: `:memory:` in tests, and the first container start in ticket 16. This keeps the vendor
  island exactly as ticket 04 drew it — no Better Auth DDL in `migrations/` — while making an empty
  database complete by booting. It is idempotent, so repeating it is free.
- **`AUTH_SECRET` joins `config.ts`** (min 32 chars, no default). Ticket 11's variable list predates
  the Better Auth decision and had nowhere for the cookie-signing secret. It is the one secret that
  must not be backed up beside `scran.db`: the research proved a stolen database replays as 401
  without it.
- **Public sign-up is closed at the Hono layer**, not by Better Auth's `disableSignUp` — that flag
  lives in the endpoint handler, so it would also block the server-side call redemption makes.
  `/api/auth/sign-up/*` is registered before the catch-all and throws 404; every other Better Auth
  route is mounted normally.
- **A dead token is 404, not the 410 the research suggested.** The message is the required generic
  one — used, expired and invented are indistinguishable — and 404 needs no new factory on ticket
  07's closed error classes.
- **`signUpSchema` is the first thing in `shared/`**, so ticket 21's form resolves the same rules
  the route validates.

### The invite mechanics

Token is 32 random bytes base64url (256 bits), stored **only** as a SHA-256 hash — a test asserts
the raw token appears nowhere in the table. Seven-day expiry. The burn is one conditional `UPDATE
... RETURNING`, so a race has exactly one winner, and it happens **before** the account is created
and is **released** if creation fails — the opposite order lets a lost race produce an account with
no invite behind it. An invite issued to an address is held to it, because otherwise forwarding the
link hands the account to whoever opens it first. Redeeming returns 201 and Better Auth's
`Set-Cookie`, so signing up *is* signing in.

`GET /api/invites/:token` returns `{ email }` and touches nothing; `POST /api/invites/:token`
redeems. The chat-previewer property the ticket called critical is therefore structural, and tested.

### CSRF, and one fix to ticket 07's boundary

`csrf({ origin: config.baseUrl })` is told its origin rather than inferring it from `Host`, plus a
`requireJson` middleware on the redeem route. Both layers are needed and a test now pins each: a
cross-origin `text/plain` post is stopped at 403 by CSRF, and a same-origin one at 400 by the
content-type check.

Writing that test found a **real bug in `errors.ts`**: `HTTPException` — what `hono/csrf` and every
other built-in throws — fell through to the generic branch, so a deliberate 403 became a 500 and
logged at `error`. The handler now returns `err.getResponse()` for it. Four lines, and it stops
every future Hono middleware lying about its status.

### Deliberately not done

- **No rate limit on the invite routes.** Better Auth's own limiter is configured explicitly
  (`window: 60, max: 100`, `enabled: true` — the documented defaults are wrong and it is off outside
  production) but it only covers its own endpoints. Guessing a 256-bit token on a LAN-only box is
  not a threat worth a table.
- **No `/api/me`.** `requireUser` is exercised by a throwaway Hono app inside the test rather than
  by adding a route ticket 05 never listed. Better Auth's `get-session` already answers "who am I".

### For the tickets downstream

`server/src/testing.ts` exports `signUpThroughInvite()`, returning a `Cookie` header from a real
invite redemption — the fixture ticket 05 promised every later test file would use.

**One manual step before anything runs**: `AUTH_SECRET` must be added to `.env` and `.env.test`
(and `.env.template`), since the agent's permissions do not extend to those files.
