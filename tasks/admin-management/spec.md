# Admin access management

Status: complete

## Agreed scope

- One shared cookbook; accounts have `member | admin` role, default member.
- Exactly one appointed admin. No web promotion/demotion or content moderation powers.
- Existing catalogue **Account** link → `/account` → admin-only **Administration** link → `/admin`.
- Admin lists accounts, disables/re-enables members, and revokes member sessions.
- Admin creates email-bound seven-day single-use invites, copies the link shown
  once, lists pending invites, and revokes unused invites. No automated email sending.
- Disable preserves content/attribution. Re-enable does not restore old sessions.
- Password recovery stays operator-only; existing personal account controls remain.

## Bootstrap and safety

The deployed app has no accounts yet. An operator creates the first invite,
the owner signs up, then runs `bun run accounts make-admin <email>` against
that existing enabled account. Safe to rerun for that account; refuses another
admin. No automatic first-signup authority. Role is attached to account ID.

Server checks current roles for management requests. Members and anonymous
callers cannot manage access; forged signup role fields grant nothing. Protect
the admin from disable, including operator CLI. Keep invite-only registration,
CSRF/JSON/body/rate controls, and CLI recovery. Persist secret-free audit records
of successful management changes. No raw invite links in query/mutation caches.

## Validation

`bun run check`, `bun test`; isolated seeded preview at phone and desktop widths,
long account identifiers, member/anonymous denial, invite and account lifecycle,
confirmation/error/loading/empty states. Ship only after validation and an
independent security/correctness review. Deployment follows
`docs/development-workflow.md` and the enabled Hostinger workflow.

## Verification

- `bun run check` passed; 181 tests passed, including real CLI bootstrap,
  endpoint access denial and failure-injection rollback tests.
- Seeded Docker preview checked at 375px and 1280px: Account navigation,
  member-only denial, existing-session admin bootstrap, invite create/copy/redeem
  and revoke, account disable/re-enable/session revocation, long names/emails,
  modal wrapping/Escape/focus return, empty pending invites, simulated loading
  and service failures with successful retry. Shared `/ui` checked at both sizes.
- Independent review found interrupted disable/re-enable and non-atomic audit
  issues; fixed with synchronous security transactions inside the auth boundary.
  Second independent review passed with no unresolved blockers.
