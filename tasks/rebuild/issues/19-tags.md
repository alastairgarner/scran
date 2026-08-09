# Model tags, and get the model to assign them

Type: grilling
Status: open
Blocked by: 06

## Question

Tags were ruled out during charting — search over name and ingredients was judged enough. Ticket 06
put them back: **FTS5 matches words that are on the page**, so every categorical question people
actually ask ("something quick", "veggie", "midweek", "freezes well") is invisible to it unless the
author happened to write that word. The prototype's filter sheet used faked tags and they earned
their place.

What's left to settle:

- **The vocabulary.** Free-form tags drift — veggie/vegetarian/veg — so the working assumption is a
  **closed list the model picks from**. What's on it? Who can change it, and what happens to
  recipes already tagged when it changes?
- **The table.** A join table on `recipe`, or on `recipeVersion`? Tags describe the *dish*, which
  argues for the recipe, not the version — but extraction produces them, and extraction produces
  versions.
- **Assignment.** A field on the extraction schema, so tags arrive with the first version? That
  puts it alongside [ticket 10](10-machine-readable-quantities.md)'s change to the same prompt and
  the same response schema — the two should probably land together.
- **Correction.** The model will tag badly. Is fixing tags part of [the editor](18-recipe-editor.md)
  or its own quiet control on the recipe page?
- **Backfill.** The existing recipes have no tags. Re-running extraction over them is forbidden once
  they have content — so either tags are assigned by a separate cheap pass, or they stay untagged
  until someone adds them by hand.

Done when the vocabulary, the table, the assignment path and the correction path are all written
down — and when it's clear whether this ships with ticket 13 or after it.
