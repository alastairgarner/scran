# Give ingredients machine-readable quantities

Type: task
Status: open
Blocked by: 04

## Question

Scaling is in scope (restored — the prototype map *deferred* it, and this map wrongly recorded that
as ruled out). Ticket 04 settled what the data must look like; this ticket changes the extraction
that produces it. This reverses the map's "the response schema in `extract.ts` survives verbatim".

The change is deliberately **additive**, so the 7 existing recipes stay valid with nulls:

- **Ingredient items** go from `{title, text}` to `{title, text, quantity, unit, food, note}`.
  `text` stays the verbatim line and is Mealie's `originalText` under a name we already use. Mealie's
  `display` is dropped — derivable at render.
- **Yield** splits: keep `recipe_yield` verbatim, add `yield_quantity` (number|null) and
  `yield_unit`. `"9-10 large muffins"` → `9` + `"large muffins"`.
- **Ranges take the lower number**, per Mealie — `text` carries the truth, so `"2-3 cloves"` still
  reads as written until someone scales it. There is no `quantityMax`.
- **The prompt** in `server/src/prompts/` changes to match. Prototype ticket 02 found the field
  *descriptions* carry most of the extraction instruction, so most of the work is there.

Then re-extract the 7 existing recipes from the photos on disk — the one and only sanctioned
re-extraction, because it predates anyone hand-editing anything.

Two things to get right rather than discover:

- **Never render a scaled line from parts you don't have.** Where `quantity` is null, fall back to
  `text` and **mark the line unscalable in the UI**, so nobody is shown a quantity the model
  invented. Same for a null `yield_quantity` — offer raw multiplier buttons, not a servings stepper.
- **Nothing here tells you whether the parsing got better or worse.** The eval harness is still out
  of scope. Judge it by eye against the 7, and say plainly how bad it is on fractions, ranges and
  the `"1 1/2 c. flour OR 1 1/4 c. + 1/4 c. cocoa"` line that already exists in the data.

Done when the schema and prompt are updated, the recorded-response fixture is regenerated, and the
7 recipes carry quantities — with the misses written down.
