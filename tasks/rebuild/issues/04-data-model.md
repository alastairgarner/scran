# Lock the multi-user, versioned data model

Type: grilling
Status: open
Blocked by: 01

## Question

The prototype had one table: `recipes`, holding the model's JSON verbatim. Four decisions have
since broken that open — accounts, versioning, per-user ratings, authored notes, and a second
ingestion source (URL/HTML) that isn't a photo.

Design the model. Open questions it has to answer:

- **Source vs recipe.** A photo and an HTML page are both "the permanent artifact the extraction
  came from". One `sources` table with a kind, or two? What happens to the prototype's sidecar
  JSON (model, token usage) — a real column, a `runs` table, or dropped?
- **Versioning.** Append-only `recipe_versions` with the model's extraction as version 1 and every
  human edit as a new row? What does "current" mean — a pointer on `recipes`, or max version?
  Does a *re-extraction* create a version, and if so what happens to the human edits after it?
- **Users, invites, sessions.** Constrained by whatever ticket 01 lands on — an auth library that
  ships its own tables decides part of this.
- **Ratings**: per user, per recipe — but per *recipe* or per *version*? The average is surfaced
  across users; where is it computed?
- **Notes**: shared, authored. Threaded or flat? Attached to recipe or version?
- **What `name` and search need lifted out** of the JSON — the prototype lifted `name` only.
  Ticket 02's answer may demand more.

Consult `/mp-domain-modeling`: this is where scran's ubiquitous language gets written down. The
words that need pinning: **source**, **extraction**, **version**, **edit**, **recipe**.

Done when the schema is written out, with the reasoning for each split, and `CONTEXT.md` carries
the vocabulary.
