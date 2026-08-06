# Lock scran's recipe schema

Type: grilling
Status: resolved
Blocked by: 02

## Question

Decide the recipe shape scran commits to: the TypeScript type, and the SQLite tables behind it.

This is the one decision in the prototype that is expensive to redo — changing it later means
re-photographing books and re-paying for extraction. Everything else here is throwaway.

Starting point is Mealie's model (ticket 02), trimmed to what a bare-minimum catalogue needs.
Things to settle:

- The ingredient model. Structured (`quantity`/`unit`/`food`/`note`) is the assumption, because it
  is what makes scaling and shopping lists possible later without re-extraction. Confirm the exact
  fields, and decide what happens to things that don't parse — "a splash of oil", "2-3 cloves",
  "1 tin (400g) chopped tomatoes".
- Ingredient groups ("For the sauce:") — modelled, or flattened for now?
- Steps: flat strings, or objects with an optional title/image?
- What is required vs optional. The LLM will not always find a cook time.
- Provenance: which book, which page, the source photo, when it was captured.
- SQLite layout: normalised tables vs a single row with a JSON column. For a prototype the JSON
  column is tempting — decide deliberately, since search and shopping lists later care.

Run `/grilling` and `/domain-modeling` for this one. Output is a TS type, the SQLite DDL, and an
ADR recording why.

## Answer

**No schema design. Store the model's JSON response as-is, keep the photo, render whatever came back.**

The ticket was framed around this being the one expensive-to-redo decision. That framing was wrong,
and the correction is what resolves it: re-extraction is only expensive if the source photos are
gone. **Keep every photo and re-extraction is an unattended script costing pennies per recipe** —
so the schema is a migration, not a one-way door, and designing it now is speculative work.

The prototype exists to answer "does photo-to-recipe actually feel good?", not "what is the correct
recipe model?". Structured ingredients (`{quantity, unit, food, note}`) exist to serve scaling and
shopping lists — both in the fog. Until one of those is being built, the structure is unused, and
an unused structure is a guess.

So:

```sql
CREATE TABLE recipes (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,       -- lifted out for the list view
  data       TEXT NOT NULL,       -- the model's JSON response, verbatim
  photo_path TEXT NOT NULL,       -- the irreplaceable bit
  created_at TEXT NOT NULL
);
```

`name` is lifted out only so the list view doesn't parse every row. Everything else stays in `data`,
queryable via SQLite's native `json_each`/`json_extract` if it turns out to be needed.

Ingredients and steps: whatever shape the prompt returns, most likely arrays of strings. Don't
post-process, don't normalise, don't parse quantities. No `display`, no `originalText`, no ranges
question — those were all downstream of structuring ingredients.

**The one hard requirement:** source photos are retained permanently. This is the only data that
can't be regenerated — everything else is one script away. Graduated out of the fog as settled.

**Also worth keeping:** the raw model response is what `data` already is, so a bad extraction is
debuggable without re-calling the API.

When shopping lists or scaling actually get built, that's when ingredients get structured — against
real recipes, with the failure cases visible, re-extracting from photos already on disk.
