# Model tags, and get the model to assign them

Type: grilling
Status: resolved
Assignee: alastair
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

## Answer

**Ten tags on two axes, hard-coded, assigned by the model at extraction, hanging off `recipe` and
not `recipeVersion`.** The third axis this ticket expected — speed — is **not a tag at all**: it
became two columns on the version, because the real data proved the alternative impossible.

### Speed is a number, not a tag — and this is the finding that mattered

The plan was to derive "quick" from `totalTime` and skip a tag entirely. The seven recipes killed
it: **six of nine rows carry no time at all**, and the one that does says `"20 minutes bake time"`
in `total_time`, which is a perform time under the wrong name. There is nothing to derive from.

So the model fills the gap. The extraction schema gains `total_minutes` and a marker for **whether
that number was stated on the page or judged from the method**, which is what makes the estimate
honest rather than invented — the prompt's *do not create any data* rule gets an explicit carve-out
for it, because reading "simmer for 40 minutes" out of a step is a judgement about what is on the
page, not a fabrication. Estimates **exclude unattended time**: an overnight prove is not three
hours of your evening.

Two columns on `recipeVersion`, additive and nullable exactly like ticket 10's `yieldQuantity`:

```
totalMinutes  INTEGER   -- NULL where even a judgement is impossible
timeEstimated INTEGER   -- 0 = the page said so, 1 = the model judged it, NULL alongside a NULL
```

The payoff is that **the bands are a UI constant, not data**. Under 30 / 30–60 / over an hour is
today's filter; changing it later is one array, with no re-extraction and no migration. It also
rescues ticket 06's **sort by quickest**, which was quietly broken — it had no number to sort on.
Estimated times render with a `~`, because *~45 min* and *45 min* are different claims.

### The vocabulary — 10 tags, one TS constant

Nothing derivable from a column is a tag. That cut *quick* (now `totalMinutes`) and *recently
added* (already the default sort), and the occasion/effort axis — midweek, make-ahead, freezes well
— was dropped as nobody's actual question.

**Diet** (always exactly one of the first three; `vegan` rides on top of `vegetarian`):
`vegetarian`, `pescatarian`, `meat`, `vegan`.

**Course** (zero or more — panzanella is main *and* side, muffins are baking *and* breakfast):
`breakfast`, `main`, `side`, `pudding`, `baking`, `snack`.

Rejected from course: `bread` (baking covers it) and `sauce`/`basic` (nothing in the catalogue is
one — add the day something is).

It lives in **a TS constant in `shared/`**, not a table. There is one deployer and six users, and a
closed vocabulary anyone can extend through a UI is free-form tags with extra ceremony — drift is
the exact thing this decision exists to prevent. Adding a tag is a one-line PR. Each entry carries
**three** things, because indexing needs the third:

```ts
{ id: 'vegetarian', label: 'Vegetarian', search: 'vegetarian veggie veg meat-free' }
```

An id that later leaves the list is **ignored on read** rather than migrated — a stale row filters
nothing and renders nothing, and pruning it is a `DELETE` someone runs or doesn't.

### The table — `recipeTag`, on `recipe`

```
recipeTag(recipeId, tag, PRIMARY KEY (recipeId, tag))
```

An **eighth table** beside Better Auth's four. Tags hang off the **recipe**, not the version, which
is a deliberate departure from ticket 04's "extraction output is versioned":

- Filtering the catalogue by tag is the *primary* query. Against JSON on the highest version it is a
  `json_each` over a correlated `MAX(versionNo)` subquery on every list load; against a join table
  it is an index lookup.
- The versioning story exists to stop a human's edit destroying **the model's extraction of the
  page**. A tag is a label on the dish, not text on the page. Nobody mourns an overwritten tag.
- It follows that **correcting a tag appends no version** — which is what makes backfill legal
  without touching the re-extraction ban.

The cost, stated plainly: the model's original tags are not recoverable once someone changes them.
Accepted.

### Assignment — a field on the extraction schema

Tags arrive with version 1, from the same call, as an array whose items are an **`enum` of the ten
ids** — so the model physically cannot invent a tag, and can return none. A separate tagging pass
was rejected: it would re-send the recipe to learn less than the call already looking at the page.

The diet rule is enforced **twice**: stated in the prompt, and normalised on write — anything tagged
`vegan` also gets `vegetarian`. A model that forgets the implication once costs a wrong filter
result forever; the guard is three lines. No SQL constraint — expressing it across rows of a join
table needs a trigger, and it isn't worth one.

**Backfill falls out for free.** Ticket 10 already sanctions re-extracting the seven existing
recipes from their photos — the one and only permitted re-extraction, since it predates anyone
hand-editing anything. Tags and `totalMinutes` come along in that same pass. No separate mechanism,
no hand-tagging.

### Search — tags go into the index, with synonyms

Searching *veggie* returns everything tagged `vegetarian`, whether or not the word is on the page.
Two consequences, and the first is **an amendment to ticket 02's trigger**:

1. `recipeSearch` gains a `tags` column. Because tags hang off `recipe` while ticket 02's trigger
   fires on `recipeVersion` insert, there must be a **second trigger on `recipeTag`** insert/delete,
   *and* the existing trigger's `DELETE`+`INSERT` must re-select the tags — otherwise every edit
   silently wipes them from the index. FTS5 also **cannot `ALTER TABLE ADD COLUMN`**, so the column
   arrives by dropping and recreating the virtual table.
2. `porter` stemming does not get you from *veggie* to *vegetarian*. What gets indexed per tag is
   the constant's **`search` string**, not the id — `vegetarian veggie veg meat-free`, `pudding
   dessert sweet afters`.

### Correction — the recipe editor owns it

Not its own control on the recipe page, which is what a purely technical reading argued for (tags
aren't versioned, so they need nothing from the editor). The human's call, and the right one:
**there should be one screen you go to when you want to change something about a recipe**, and
splitting "edit the text here, edit the tags there" invents a distinction that only exists in the
schema. The tag row in the recipe header stays read-only.

Consequence: the tag **UI** waits on [ticket 18](18-recipe-editor.md), which is still an unresolved
prototype — recorded there. Behind the seam, the editor saves tags as a plain write to `recipeTag`
while text edits append a version. Two writes, one screen.

### Sequencing — split three ways, no new ticket

- **Schema, vocabulary constant, prompt, assignment, migration** → [ticket 13](13-recipes-and-extraction-build.md),
  merged into [ticket 10](10-machine-readable-quantities.md)'s change to the same prompt and the
  same response schema. One edit to `extract.ts`, one migration. Ticket 13 keeps its `19` dependency.
- **Filter chips and the speed bands** → [ticket 21](21-client-build.md). They only read.
- **Tag editing** → [ticket 18](18-recipe-editor.md), whenever it lands.

So tags arrive correct from the model on day one, and hand-correction arrives with the surface that
was always going to own it. This closes both the "ships with 13 or after" question and the backfill
question from the map's **Not yet specified**.

### Migration note

`recipeTag`, the two time columns and the rebuilt `recipeSearch` are one migration. Ticket 11's
`001-init.sql` has only ever run against an empty local database — the seven recipes still live in
the prototype's old `recipes` table until ticket 17 — so **folding these into `001` and recreating
the dev database is the smaller diff** than a `002` that drops and rebuilds a virtual table nobody
has used. Build-time call: if `001` has by then run anywhere that matters, write `002` instead.
