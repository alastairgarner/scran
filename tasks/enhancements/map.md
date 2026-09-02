# Map: Post-launch enhancements

> **This map is parked, not charted.** It exists so enhancements have somewhere to land instead of
> distorting the rebuild's scope. The destination below is provisional and the fog is a dumping
> ground, not a survey. Chart it properly — a real grilling session on the destination and the
> frontier — once [the rebuild](../rebuild/map.md) has landed and the app has been used for a
> while, because what launch teaches is the whole input to which of these are worth building.

## Destination

**scran does more than it did on the day it launched**, decided one enhancement at a time. Each
ticket settles whether a capability is worth having and what shape it takes; the map is done when
there's nothing left in the fog that anyone wants.

Deliberately open-ended — this is a standing map, not a project with an end date. That's the
trade-off for having somewhere to put things.

## Notes

**Domain**: self-hosted family recipe catalogue. Two predecessor maps, both required reading before
relitigating anything:

- [Rebuild scran properly](../rebuild/map.md) — the app this map enhances. Its Decisions-so-far
  holds the stack, the schema, the design system and the look-and-feel. **Every ticket here starts
  by checking what it already settled**, because most of these questions have half an answer there.
- [Recipe capture prototype](../prototype/map.md) — the extraction pipeline and the original
  schema reasoning.

**Not the public deploy.** A domain, TLS, a VPS, passkeys and [the hostname
decision](../rebuild/issues/09-lan-tls-certificate.md) are a **separate map** that the rebuild map
already promises by name. That map is about reaching more people; this one is about the app doing
more. Keep them apart — they share almost no decisions.

**This map carries execution**, like both its predecessors: `task` tickets build things, and the
quality bar is the rebuild's, not the prototype's.

**Nothing here starts before the rebuild finishes.** Every ticket touches code that ticket 21
hasn't written yet. Tickets can be *charted* early — the meal-photo one already is — but resolving
one against a codebase that doesn't exist is how you get decisions that don't survive contact.

**The domain vocabulary lives in [CONTEXT.md](../../CONTEXT.md).** Read it before naming anything.

**Skills**: `/mp-grilling` + `/mp-domain-modeling` by default. `/mp-prototype` for anything with a
look. `/mp-research` for third-party facts.

## Decisions so far

<!-- one line per closed ticket -->

_Nothing yet._

## Not yet specified

<!--
  A parking lot, not a survey. Most of these arrived by being ruled out of the rebuild map — which
  means they were judged out of *that* scope, not judged worthless. None has been examined since.
  Charting this map properly means going through these and deciding which are real.
-->

- **[Semantic search](../rebuild/issues/02-search-approach.md).** FTS5 shipped alone, and that
  ticket was explicit that vectors are "an additive upgrade, not a fork". It also found `sqlite-vec`
  can't load on macOS at all and has no ANN index — so this reopens as "what would it even run on",
  not "shall we turn it on".
- **[An eval harness for extraction quality](../prototype/issues/08-eval-harness.md).** Ruled out
  twice now, and the gap it names is real: nothing tells you a prompt change made extraction worse.
  The rebuild's recorded-response fixtures are most of the harness already, which is the argument
  for it graduating here rather than staying dead.
- **Version history UI.** The rebuild built full append-only versioning and deliberately shipped no
  way to see it — "no history UI until someone actually wrecks a recipe". Whether anyone ever does
  is exactly the kind of thing launch answers.
- **Shopping lists.** Ruled out flatly during the rebuild's charting. Scaling and machine-readable
  quantities landed anyway, so the structured ingredient data a shopping list needs now exists,
  which removes the original objection without supplying a reason to build it.
- **Meal planning and calendars.** Inherited as out-of-scope from the prototype map and never
  examined. Genuinely unclear whether this is one feature or a different app.
- **Tag vocabulary drift.** The rebuild picked a closed list the model chooses from. Whether it's
  the right list, and what changing it does to already-tagged recipes, is a question with no answer
  until there are enough recipes to be annoyed by.
- **[Recipe website formats](issues/03-recipe-website-formats.md).** URL import initially supports
  WP Recipe Maker's structured card, Schema.org Recipe JSON-LD, Microdata/RDFa and visible-content
  fallbacks. Research which other generators deserve direct support before growing the parser.

## Out of scope

- **The public deploy** — domain, TLS, VPS, passkeys, offsite backups, and
  [the hostname decision](../rebuild/issues/09-lan-tls-certificate.md). Its own map, promised by
  name in the rebuild map's Out of scope. Not fog here; it will never graduate into this map.
- **Anything the rebuild is still building.** If it's an open ticket on
  [the rebuild map](../rebuild/map.md), it belongs there. This map starts where that one stops.
- **Scanner hardware.** Inherited from the prototype map and still silly.
