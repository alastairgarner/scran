# Build auth, invites and the invite command

Type: task
Status: open
Blocked by: 11, 20

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
