# FTS5, vectors, or both — what should recipe search be?

Type: research
Status: resolved

## Question

Search is in scope, tags are not. The catalogue will be a few hundred recipes at most, in one
shared list, and the questions people ask it are "what can I do with aubergines" and "something
warming with lentils". The first is lexical; the second isn't.

Find out:

- **SQLite FTS5 via `bun:sqlite`** — is it compiled in, or does it need a custom SQLite build?
  This is the deciding fact: if FTS5 isn't available in Bun's bundled SQLite, the cheap option
  evaporates and the whole question changes.
- **Indexing shape.** Recipes are stored as the model's JSON. What gets indexed — name plus
  flattened ingredient lines plus instructions? How does an FTS index stay in sync with an
  append-only versioned recipe (index the current version only, presumably)?
- **Vector search on SQLite** — `sqlite-vec` or equivalent under Bun. Cost per recipe to embed,
  what it needs at query time, and whether it can sit *beside* FTS5 over the same rows rather
  than replacing it.
- **Is it worth it at this size?** A few hundred recipes is small enough that a brute-force
  cosine scan over embeddings in memory may beat any index. Say so if so.

Answer: what to build now, and what the upgrade path looks like if now isn't enough.

## Answer

**FTS5 now, nothing else.** No vectors, no `sqlite-vec`. Full findings and citations:
[research/02-search-approach.md](../research/02-search-approach.md).

- **FTS5 is compiled in**, verified by running it on both platforms rather than reading docs —
  macOS (system SQLite 3.51.0) and `oven/bun:1-slim` (Bun's static SQLite 3.53.0) both report
  `ENABLE_FTS5` and complete a `MATCH`/`bm25`/`snippet` round trip. Worth having checked: Bun's
  docs say Linux "follows upstream defaults", and upstream defaults have FTS5 **off**. Bun's build
  script sets it explicitly.
- **Sync is one trigger**, not application code: `AFTER INSERT ON recipe_versions` deletes the
  index row for that `recipe_id` and re-inserts from the new version's JSON via `json_each` +
  `group_concat`. `rowid = recipes.id`, so one index row per recipe however many versions exist,
  and superseded text becomes unfindable. Nothing can forget to reindex.
- **Plain `fts5`, not `content=''`** — contentless mode returns `NULL` from `snippet()` and
  `highlight()`, which is the entire reason to want it. Own-content costs +704 KiB at 300 recipes.
- **At this size no index is needed for speed**: `LIKE '%…%'` scans 300 recipes in 557 µs versus
  FTS5's 12.7 µs. Both invisible. FTS5 earns its place on *behaviour* — bm25 ranking, porter
  stemming (`roasting`→`roasted`, `lentils`→`lentil`), snippets — all of which is less code than
  hand-rolling it over `LIKE`.
- **`sqlite-vec` is rejected on shape, not merit**: it works under Bun on Linux but **cannot load
  on macOS at all** (Apple ships `OMIT_LOAD_EXTENSION`). Works in prod, broken on the dev machine
  is the worst shape a dependency can take. It also has no ANN index — its own README says
  brute-force only — so it buys nothing over a `Float32Array` scan, measured at 0.45 ms and
  1.8 MiB for 300×1536 vectors, viable to ~10k recipes in ~10 lines.

**Upgrade path**, if "something warming with lentils" proves a real miss: add an `embedding BLOB`
column → in-memory cosine scan → blend with FTS5 by rank fusion → `sqlite-vec` only at thousands
of recipes. Steps 1–2 are purely additive. Embedding 300 recipes costs $0.003; the real cost of
semantic search is ~100–300 ms per query to embed the search string, and an OpenAI dependency on
the search box.

## Amendment from [ticket 19](19-tags.md)

Tags are indexed, so searching *veggie* returns everything tagged `vegetarian` whether or not the
word is on the page. Three consequences for what this ticket built:

- **`recipeSearch` gains a `tags` column.** FTS5 does not support `ALTER TABLE ADD COLUMN`, so it
  arrives by dropping and recreating the virtual table — free while nothing has been indexed yet.
- **`recipeVersionIndex` must re-select the tags** in its `DELETE`+`INSERT`. Tags hang off `recipe`
  and this trigger fires on `recipeVersion`, so without it every edit silently wipes them from the
  index — the exact class of bug the trigger exists to prevent.
- **A second trigger on `recipeTag`** insert/delete keeps the column current, since no version is
  appended when someone corrects a tag.

What gets indexed per tag is a **synonym string**, not the id — `porter` stemming does not reach
from *veggie* to *vegetarian*. It lives beside the id and label in ticket 19's TS constant.
