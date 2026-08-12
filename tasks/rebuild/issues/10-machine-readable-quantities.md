# Give ingredients machine-readable quantities

Type: task
Status: resolved
Assignee: alastair
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

## Amendment from [ticket 06](06-look-and-feel.md)

Prototyping the scaling UI added one requirement and confirmed another:

- **Cook-friendly rounding belongs here, not in the view, and it must be unit-aware.** Scaling to a
  stepper value produces things like `1.22 egg` and `0.306 tsp. salt`. The obvious fix — snap each
  line to a tidy fraction — is **wrong**: snapping lines independently drifts the *ratios* between
  them, which for baking is a broken recipe. Correct rounding needs the unit (grams to the nearest
  5, eggs to a whole, spoons to a quarter), which only exists once this ticket lands. Until then
  the client shows significant figures, which is ugly and honest.
- The "mark the line unscalable" requirement above is **confirmed by use** — the UI marks such
  lines `(unscaled)` and it reads fine. But the prototype's crude `\bor\b` guard produced a false
  positive on `1/3 c. melted butter **or** corn oil`, where the "or" offers an alternative
  *ingredient*, not an alternative *quantity*. Worth getting right here rather than in the view.
- Real evidence for the prompt work: Panzanella currently carries `"2 tablespoons red wine chopped
  torn croutons (page 269)"` — two ingredient lines welded into one by the extraction.
- [Ticket 19](19-tags.md) changes the same prompt and the same response schema. The two should
  probably land together.

## Amendment from [ticket 19](19-tags.md)

Tags land in **the same prompt and the same response schema** as this ticket, so the two are one
edit to `extract.ts`. Ticket 19 also handed this ticket a third parsed field, for the same reason
`yield_quantity` exists — the verbatim text is unusable by anything but a human eye:

- **`total_minutes` (number|null) and a stated-versus-estimated marker.** The real data forced it:
  six of the nine existing rows carry **no time at all**, and the one that does has
  `"20 minutes bake time"` sitting in `total_time`. There is nothing to derive a "quick" filter
  from, so the model supplies the number — **judging it from the method where the page doesn't say**,
  and flagging that it did.
- The prompt's *do not create any data* rule gets **one explicit carve-out** for that judgement, and
  only that one. Estimates **exclude unattended time** (an overnight prove is not three hours of
  your evening).
- Columns on `recipeVersion`: `totalMinutes INTEGER`, `timeEstimated INTEGER` (0 stated, 1 judged,
  NULL alongside a NULL `totalMinutes`). Additive and nullable, exactly like `yieldQuantity`.
- `totalTime` / `prepTime` / `performTime` **stay verbatim**, as `recipeYield` does.
- The client renders an estimate with a `~`. Speed **bands** (under 30 / 30–60 / over an hour) are a
  UI constant over this number, never stored — retuning them is one array, no re-extraction.
- The sanctioned re-extraction of the seven recipes now also produces **tags**, which is the whole
  of ticket 19's backfill story.

## Answer

**Done, in the field descriptions and almost nowhere else.** Ingredient items gained
`quantity`/`unit`/`food`/`note`, yield split, and ticket 19's `total_minutes`, `time_estimated` and
`tags` landed in the same edit as planned. The tag vocabulary is now `TAGS` in `shared/`, with
`normaliseTags` enforcing vegan⇒vegetarian. Four real `gpt-5` calls against the four distinct
prototype photos, iterated four times, are the evidence — and they are checked in as
`server/src/fixtures/extractions.json` so ticket 13 does not pay for them again.

### The unit is a label, not a measure — so there is no unit vocabulary

The charting assumption was a closed unit enum, on ticket 19's anti-drift argument. **The human's
call, and the right one: multiplication does not care what the unit says.** `1 thumb` × 2 is
`2 thumb`. Nothing in this map converts between units — no grams-to-ounces, no
teaspoons-to-tablespoons — so a unit only ever has to survive being carried from extraction to
render. It is therefore **a free-form string the code never reads**, and "thumb-sized piece",
"small bunch" and "head" are units exactly as much as "g" is.

That deletes an enum, a normalisation map and every argument about which units are on the list.

### Rounding is ruled out, which **overrides ticket 06's amendment**

That amendment demanded cook-friendly, unit-aware rounding and made it this ticket's debt, on the
grounds that `1.22 egg` and `0.306 tsp. salt` are unusable. The human's call is **no rounding at
all** — `1.22 thumbs of ginger` is the most accurate thing that can be shown, and ticket 06's
significant figures are not an interim that this ticket pays off but **the answer**.

This is the second thing to fall out of the unit decision: unit-aware rounding needs a unit
vocabulary to key its table off, so ruling out the enum and ruling out the rounding are the same
ruling. Ticket 21 renders significant figures and nothing more; there is no `scale.ts`.

### Scope, because this ticket's done-when was circular

The ticket wanted the fixture regenerated and the seven recipes carrying quantities — both of which
need ticket 13's extraction module and ticket 17's migration, and **this ticket blocks 13**. Split:
the schema, the prompt and the evidence are here; the fixture *format* is 13's, which now has real
recorded responses to shape; the backfill is 17's, which already owned it. Nothing moved that was
not already someone else's.

### The `\bor\b` guard is deleted, not fixed

Ticket 06 wanted the prototype's crude "or" heuristic corrected, because it wrongly marked
`1/3 c. melted butter or corn oil` unscalable. **There is no heuristic in the answer.** A line is
unscalable if and only if `quantity` is null, and the model decides that while looking at the page —
where a choice of *ingredient* at one amount keeps its quantity and a choice of *amount*
(`1 1/2 c. flour OR 1 1/4 c. + 1/4 c. cocoa`) does not. The view asks one question of the data
instead of parsing English.

### How bad it is, plainly

Final run, 50 ingredient lines across four recipes:

- **47 scalable, 3 not — and all three genuinely are**: `vegetable oil, for frying`,
  `Kosher salt and freshly ground black pepper`, and the muffin page's marginal
  `or 1/2 pkt choc chips…`. **No false positives**: no line was given a quantity it should not have.
- **Fractions are clean.** `1 1/2`→1.5, `1/3`→0.333, `¼`→0.25, `1½`→1.5, `2½`→2.5. Unicode and
  ASCII both. This was the fear and it is a non-issue.
- **Ranges**: `9-10` correctly yields 9 with `recipe_yield` verbatim. Only one range exists in the
  data, so this is thinly evidenced.
- **Yield 4/4, `total_minutes` 4/4, exactly one diet tag 4/4.** Panzanella came back
  `main` *and* `side`, which is the case ticket 19 predicted when it made course multi-valued.

Three prompt bugs were found and fixed by iterating, all of them in the descriptions:

1. **`a bunch of spring onions` returned a null quantity.** A line naming one of something without
   writing the numeral is the single most common British-cookbook idiom in this catalogue, and it
   was the one case the human's steer was explicitly about. Fixed by naming it, with examples;
   it now returns `1 "bunch"`, `1 "thumb-sized piece"`, `1 "small bunch"`.
2. **The unit duplicated the food on countable lines** — `1 red onion` came back as unit
   `"red onion"`, food `"red onion"`, which renders as *2 red onion red onion*. Fixed by telling the
   model the unit is null whenever it would simply repeat the food.
3. **The `total_minutes` carve-out leaked into `total_time`**, which is a verbatim field: pages
   stating no time started coming back with `"about 40 minutes"` invented into them. This is the
   prompt's cardinal rule breaking, and it was **caused by this ticket** — the licence to judge had
   to be fenced to the one field that has it. Fixed and confirmed null on all three such pages.

Two known misses, neither worth another round:

- **`time_estimated` is unstable on the muffin page**, which states `20 min` bake time and no total.
  Runs disagreed between `false` (copied the page) and `true` (judged, since a bake time is not a
  total). Both are defensible readings of the rule as written, and the number is 20–30 either way.
- **Panzanella is a two-column magazine spread and the model reads it differently every time.**
  Across four runs it produced a welded line, then two invented ingredients, then a clean and
  correct extraction. Adding a two-column instruction to the prompt helped but did not settle it.
  **This is not a quantities problem** — it is the same class as the rotated page, so it belongs to
  [ticket 15](15-capture-orientation.md), recorded there rather than chased here.

### For the tickets downstream

- **[13](13-recipes-and-extraction-build.md)** is unblocked, and gains
  `server/src/fixtures/extractions.json` plus a README. Its zod content schema is the JSON Schema in
  `extract.ts` transcribed — that file is prototype code it replaces, and the descriptions are the
  asset, not the code around them. It also owns the migration for `totalMinutes`, `timeEstimated`
  and `recipeTag`, and the vegan⇒vegetarian normalisation on write is already written as
  `normaliseTags` in `shared/`.
- **[21](21-client-build.md)**: significant figures, no rounding, and a line renders scaled only
  where `quantity` is non-null — otherwise show `text` and mark it. There is no `or` heuristic to
  port.
- **[15](15-capture-orientation.md)**: the Panzanella spread is a second, harder instance of the
  bug that ticket already exists for. Multi-column layout, not rotation.

### Decoding, tested after the fact

Prompted by a research summary of extraction best practice, three of whose recommendations this
ticket had already implemented (schema-enforced output, per-field descriptions, an explicit
missing-data rule) and one of which — worked examples — was declined, since the descriptions already
carry examples at the point of use and `strict` schema enforcement reduces the need. Two were
untested, so they were tested: three repeat runs each against Panzanella, the one photo that will
not sit still.

```
arm                 line overlap   ingredient count   total_minutes   yield
A  as-is                    17%    13 / 11 / 13       50 / 60 / 45    4 / 6 / 4
B  image before text        11%    10 / 11 / 11       40 / 40 / 45    6 / 4 / 6
C  temperature 0            37%    10 / 10 / 10       45 / 45 / 45    4 / 4 / 4
```

- **Image-before-text is worse, not better** — rejected. n=3, so this is weak evidence rather than a
  refutation, but there is no reason to adopt it. Recorded so nobody re-tries it.
- **`temperature: 0` is adopted**, and gpt-5 accepts it rather than rejecting it as some reasoning
  models do. Confirmed across all four photos with no regression; the muffins even shed a spurious
  `pudding` tag. The fixture is recorded at this setting.

**The shape of that win is the finding, not the win itself.** Temperature 0 froze every *derived*
field perfectly — count, yield, time, tags — while the verbatim `text` kept moving. Had the
instability been sampling, it would have frozen the whole output. It froze the judgement and left
the reading wobbling, which is direct evidence that Panzanella is a **perception** failure and not a
prompt or decoding one. No wording and no decoding parameter fixes a two-column spread the model
cannot resolve; that needs preprocessing, and it belongs to [ticket 15](15-capture-orientation.md).

### One known hole, deferred by decision

`quantity` being non-null is not quite sufficient for a line to be safely scalable. Where a line
offers a **choice of amount** — `the kernels from 1 corn on the cob or 200g frozen kernels` — the
model picks one and strands the other in `note`, which is prose and never scales. Doubling renders
*"2 corn on the cob, or 200g frozen kernels"*, half of it silently wrong. One line in fifty in the
real data.

Deferred to the post-launch map as
[Ingredient lines that offer a choice of amount](../../enhancements/issues/02-alternative-amounts.md)
rather than fixed here: the fix is a nested `alternatives` array plus a renderer branch plus an
editor case, all designed against zero real usage, and **hand-correction is a legal backfill path**
so nothing is foreclosed by waiting. The interim consequence belongs to ticket 21, recorded there:
`note` must render as verbatim prose and must never be treated as scalable.
