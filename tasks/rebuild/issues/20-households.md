# Do households exist, and what are they for?

Type: grilling
Status: resolved
Assignee: alastair
Blocked by: 06

## Question

Couples rate meals together. Ticket 06's catalogue scopes its rating mark to **Everyone / Our house
/ Me**, and nothing in the current model can answer "who counts as our house".

Two shapes were already tried and one was rejected: a **per-person picker** needs no schema at all
(a household is just a saved selection) but was rejected as faff in use. Three fixed scopes are one
tap — and they buy that by making `household` a real thing.

What has to be settled:

- **Is a household an entity or a preference?** A table with membership, or a list of user ids
  stored against a user? The second is cheaper and wrong if two people must agree on who's in it.
- **How does someone join one?** [Ticket 01](01-auth-and-sessions.md) settled single-use invite
  links that open a signup form. Does an invite carry the household, so inviting your partner puts
  them in yours automatically? That is probably the whole answer, and it's cheap.
- **One household per person, or several?** Cheap to allow, expensive to explain.
- **Does anything else become household-scoped?** Comments, capture attribution, the catalogue
  itself? The map's answer is one shared catalogue, and nothing here should quietly fork it.
- **What if a household has one person?** `Our house` and `Me` become identical — is that a bug in
  the UI or fine?
- **Do couples ever want one account instead?** Nothing stops two people sharing a login today, and
  the schema needs no new concept for that. This ticket exists because they wanted *separate*
  logins and a *joint* verdict — worth confirming that's still true before paying for it.

Amends [ticket 04](04-data-model.md) (ratings are per-user, with no group) and possibly
[ticket 01](01-auth-and-sessions.md) (invites gain a household).

## Answer

**A household is a saved selection, not an entity.** There is no shared household object, no
membership, and no agreement mechanism. `Our house` is *your* view of your house — a list of
people you have pointed at — and two people may hold contradictory lists without either being
wrong.

**The scale settles it.** Six users, three couples, one household each. That means the list holds
**exactly one person**, and the whole feature is "me and my partner". A real entity buys agreement
about who is in a household; nobody is asking for agreement about a set of size one.

This keeps ticket 06's three fixed scopes (Everyone / Our house / Me) and the one-tap catalogue mark
it was built for, while paying almost none of what an entity costs — no join flow, no leave flow,
no one-or-many question, no invite plumbing, no consent.

### The table

```
householdMember(userId, memberUserId)
```

One row per **relation**, not per household. You pointing at your partner is one row; their
reciprocal is a second, independent row. It is a plain many-to-many join table, it is **ours** and
not Better Auth's, and it makes seven tables beside Better Auth's four.

Rejected: a `userSettings` table with a JSON list (a list that gets *queried* belongs in rows — JSON
columns are for lists nothing ever filters on, which is exactly why ticket 04 kept the ingredient
lists as JSON and this is not that), and a scalar `housemateUserId` foreign key (legitimate, since
the list is provably one person, but it caps the concept at one housemate and creates a settings
table holding a single setting).

### How the list gets populated

**The settings UI, and only the settings UI.** Seeding the pairing from the invite was considered and
**dropped**: a `--housemate` flag on `bun run invite` would save each user one tap, once, ever, in
exchange for a column on the invite table, redemption logic, and amendments to two closed tickets.
One mechanism beats two.

The consequence is the useful one: **tickets 01 and 12 are unamended, and ticket 12 no longer depends
on this ticket.** Auth builds without knowing households exist.

### Asymmetry is fine

If you add your partner and they don't add you, your `Our house` works and theirs is hidden. That is
accepted, not a bug. Mirroring the write would mean one person's action silently editing another
person's settings — shared state with no agreement mechanism, which is worse than either shape on its
own. At three couples it self-corrects the first time anyone looks.

### Empty list

When your list is empty, `Our house` and `Me` return identical sets forever, so the scope is **hidden
entirely** rather than shown as a duplicate. This covers the single person and the very first account,
before any invite has gone out.

### Blast radius: the rating scope, and nothing else

The catalogue stays shared, comments stay shared-but-authored, capture attribution is unchanged.
Nothing else becomes household-scoped. This is written down as a boundary because a `householdMember`
table is precisely what a later ticket reaches for when it wants "my people".

**The amendment to [ticket 04](04-data-model.md) is narrower than this ticket predicted**: the
`rating` table does not change. Ratings stay one row per person per recipe. The scope is a `WHERE` on
the read path inside `recipes.ts`, not a column and not a group.

### The settings surface — and sign out

Ticket 06 gave scran **one destination and no tab bar**, so this invents its second surface: a
**gear/profile icon in the catalogue header opening a drawer**. Deliberately lean — housemates, who
you are, and sign out. Not a sheet-within-the-filter-sheet: filter state lives in the URL per ticket
05, settings is persisted server state, and mixing them muddies both.

**Sign out enters the map here.** Ticket 06 settled every screen and never gave the app a way to sign
out or see who you are signed in as; this drawer fills that hole because it is being built anyway.

Invites stay a CLI command per ticket 05 — generating a link is a once-per-person act and there is a
terminal.

Built by [ticket 22](22-settings-and-households-build.md).
