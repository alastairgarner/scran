# Do households exist, and what are they for?

Type: grilling
Status: open
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
