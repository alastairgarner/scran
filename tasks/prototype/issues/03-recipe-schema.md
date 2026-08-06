# Lock scran's recipe schema

Type: grilling
Status: open
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
