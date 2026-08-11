# Build the settings drawer, households and sign out

Type: task
Status: open
Blocked by: 11, 21

## Question

[Ticket 20](20-households.md) settled what a household is — a per-user saved selection, not an
entity — and in doing so gave scran its **second surface** and its **first way to sign out**. This
ticket builds all three. Small, self-contained, and deliberately unsequenced: it can land early or
last without changing anything else.

- **The migration.** `householdMember(userId, memberUserId)` — a many-to-many join table, one row
  per relation, both directions independent. Foreign keys to Better Auth's `user` table, and a
  decision about what happens to the rows when a user is deleted (nobody is deleting users yet, so
  the cheap answer is probably `ON DELETE CASCADE` and no further thought). This lands as a **new
  numbered migration**, not an edit to `001-init.sql` — ticket 11 already ran.
- **A `household` module** — read my list, set my list. Two functions. Per ticket 05 no route
  contains SQL, so this is where the queries live even though there are only two.
- **The rating scope filter.** `recipes.ts` gains a scope on the ratings read: `everyone`, `house`,
  `me`. `house` is me plus my `householdMember` rows — one join, no new column on `rating`. The
  catalogue's aggregate mark (ticket 06: modal, ties rounding down) is computed over whatever the
  scope returns.
- **Hide `Our house` when the list is empty**, so a scope that provably cannot differ from `Me`
  never appears. The client needs to know the list is empty, which it does anyway to render the
  drawer.
- **The drawer.** A gear or profile icon in the catalogue header opens it. Contents, and nothing
  more: who you are, your housemates, sign out. The housemate picker over ~6 accounts is a plain
  list of every user with a toggle — there is no search, no invite-from-here, no avatar upload.
- **Sign out.** Better Auth's `signOut`, then back to the signin screen. This is the first time the
  map has one.

Open questions, all small enough to answer while building:

- Does the drawer reuse the bottom-sheet component from ticket 06, or is a side drawer a fourth
  hand-written component? Ticket 03 settled on four components and no library, so a fifth is a real
  (if minor) addition to the design system.
- Does the picker list *every* account, or exclude those who already have a full house? Every
  account, almost certainly — six users, and "already paired" is not a fact this model even holds.
- Where the scope selection persists, if anywhere. Ticket 05 gave the URL the filter state; whether
  the rating scope is a URL param or a sticky preference is unsettled, and the lazy answer is the
  URL, like every other filter.

Depends on [ticket 11](11-server-foundation.md) for the migration runner and on
[ticket 21](21-client-build.md) for a client to put a drawer in. Nothing depends on it.
