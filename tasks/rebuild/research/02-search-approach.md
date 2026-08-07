# FTS5, vectors, or both — what should recipe search be?

Research for [issue 02](../issues/02-search-approach.md). Researched 2026-08-07.

## TL;DR

- **FTS5 is compiled into the SQLite that `bun:sqlite` ships, on both platforms that matter.**
  Verified empirically, not from docs: macOS (Bun 1.1.42, SQLite 3.51.0, Apple's system library) and
  Linux (`oven/bun:1-slim`, Bun 1.3.14, SQLite 3.53.0, Bun's static build) both create an `fts5`
  virtual table and run `MATCH`, `bm25()`, `snippet()`, `highlight()`. Bun's build script sets
  `SQLITE_ENABLE_FTS5: 1` explicitly. **The cheap option is available. Build it.**
- **The whole sync mechanism is one trigger.** `AFTER INSERT ON recipe_versions` deletes the FTS row
  for that `recipe_id` and re-inserts it from the new version's JSON via `json_each`. Append-only
  versioning stays intact; the index holds only the current version. Zero application code.
  Verified working.
- **Don't add sqlite-vec now, and if you ever do, know it doesn't work on your Mac.** Apple's system
  SQLite is built with `SQLITE_OMIT_LOAD_EXTENSION`, so `db.loadExtension()` throws on macOS. It
  works fine in the Linux container. A dependency that runs in prod but not on the dev machine is
  the worst shape a dependency can have.
- **At a few hundred recipes, brute-force cosine in JS beats any vector index**: 0.45 ms/query over
  300×1536 floats, 1.8 MiB resident. That is the entire semantic-search implementation. No
  extension, no `vec0` table, no platform problem.
- **Recommendation: FTS5 now, nothing else.** See [RECOMMENDATION](#recommendation).

---

## 1. The deciding fact: is FTS5 in Bun's SQLite?

**Yes, on both macOS and Linux.** This was the ticket's stated pivot, so it was verified by running
code rather than by reading docs.

### macOS — Apple's system SQLite

Bun's docs are explicit that macOS does not use Bun's own build
([bun.com/docs/api/sqlite](https://bun.com/docs/api/sqlite)):

> On macOS, Bun uses the system-provided SQLite, which Apple builds with persistent WAL enabled.

So on macOS the answer depends on Apple, not on Bun. Run against this repo's Bun:

```
bun 1.1.42
sqlite 3.51.0
compile_options: … ENABLE_FTS3, ENABLE_FTS3_PARENTHESIS, ENABLE_FTS4, ENABLE_FTS5, ENABLE_RTREE, … OMIT_LOAD_EXTENSION …
fts5 OK
match aubergine: [ { name: "Aubergine parmigiana" } ]
snippet: [ { s: "[Roast] the aubergines until soft" } ]
highlight: [ { h: "Warming <b>lentil</b> soup" } ]
```

`ENABLE_FTS5` is in `PRAGMA compile_options`, and a real round trip — create, insert, `MATCH`,
`bm25()`, `snippet()`, `highlight()`, prefix `aub*` — all work.

### Linux — Bun's static build (the Docker target)

This is the one that actually matters, because the destination is a container. Bun's docs say:

> On Linux and Windows, Bun statically links its own SQLite build, which follows upstream defaults.

"Follows upstream defaults" is alarming, because the SQLite amalgamation does **not** enable FTS5
unless `SQLITE_ENABLE_FTS5` is defined
([sqlite.org/compile.html](https://sqlite.org/compile.html)). The docs sentence is not sufficient
evidence. Bun's own build script is
([`scripts/build/deps/sqlite.ts`](https://github.com/oven-sh/bun/blob/main/scripts/build/deps/sqlite.ts)):

```ts
defines: {
  SQLITE_ENABLE_COLUMN_METADATA: true,
  SQLITE_MAX_VARIABLE_NUMBER: 250000,
  SQLITE_ENABLE_RTREE: 1,
  SQLITE_ENABLE_FTS3: 1,
  SQLITE_ENABLE_FTS3_PARENTHESIS: 1,
  SQLITE_ENABLE_FTS5: 1,          // <—
  SQLITE_ENABLE_JSON1: 1,
  SQLITE_ENABLE_MATH_FUNCTIONS: 1,
  …
}
```

And empirically, in `oven/bun:1-slim`:

```
bun 1.3.14
sqlite 3.53.0
compile_options: … ENABLE_FTS3, ENABLE_FTS3_PARENTHESIS, ENABLE_FTS5, ENABLE_MATH_FUNCTIONS, ENABLE_RTREE …
fts5 OK
```

Same results as macOS. **FTS5 needs no custom SQLite build, no `setCustomSQLite`, no extra
dependency, on either platform.** The cheap option is real.

### Incidental findings worth having

- **Extension loading differs by platform.** On macOS `db.loadExtension(...)` throws
  `This build of sqlite3 does not support dynamic extension loading` — Apple ships
  `OMIT_LOAD_EXTENSION` (visible in the compile options above). On Linux it works; the error for a
  bogus path is `cannot open shared object file`, i.e. it got as far as `dlopen`. Bun documents the
  macOS workaround: *"By default, macOS ships with Apple's proprietary build of SQLite, which
  doesn't support extensions"* → call `Database.setCustomSQLite(path)` with a full `libsqlite3.dylib`
  before constructing any `Database`. This is section 4's problem, not FTS5's.
- **JSON functions are built in** on both (`json_extract`, `->>`, `json_each`, `group_concat`).
  `CREATE VIRTUAL TABLE … USING json1` fails, but that's expected — JSON has been in the core since
  3.38, not a loadable module.
- The macOS SQLite version (3.51.0) is *older* than the Linux one (3.53.0). Both are well past 3.43,
  which is what `contentless_delete=1` needs; both accept it (tested).

---

## 2. Indexing shape

### What goes in the index

Recipes are stored as the model's JSON verbatim. The current rows look like this (real data,
`data/scran.db`):

```json
{
  "name": "Chocolate Chip Muffins",
  "description": "Simple, delicious muffins packed with chocolate chips…",
  "ingredients": [ { "title": null, "text": "1 1/2 c. all purpose flour (plain)…" }, … ],
  "instructions": [ { "title": null, "text": "Mix dry ingredients and add chocolate chips." }, … ],
  "notes": [ … ]
}
```

Three columns is the right shape — **name, ingredients, instructions** — not one blob, because FTS5
lets you weight columns independently in `bm25()` and scope a query to one column. A name match
should outrank a passing mention in step 4:

```sql
SELECT rowid FROM recipe_fts WHERE recipe_fts MATCH 'chocolate'
ORDER BY bm25(recipe_fts, 10.0, 5.0, 1.0) LIMIT 20;
```

The FTS5 docs describe exactly this
([sqlite.org/fts5.html](https://sqlite.org/fts5.html)):

> `SELECT * FROM ft WHERE ft MATCH ? ORDER BY bm25(ft, 10.0, 5.0);`

`description` and `notes` are deliberately left out. Notes are shared-but-authored per the map, and
indexing them means a note edit has to reindex the recipe — a second sync path for a search nobody
asked for. Add them later if search misses things; the trigger is one line longer.

### Which FTS5 flavour: plain, `content=''`, or external-content

FTS5 offers three storage modes. They are not equivalent here:

| Mode | Stores text? | `snippet()`/`highlight()` | Plain `DELETE` | Fit |
|---|---|---|---|---|
| plain `fts5(a,b,c)` | yes, own copy | ✅ | ✅ | **this one** |
| `content=''` (contentless) | no | ❌ columns come back `NULL` | needs `contentless_delete=1` (3.43+) | tempting, wrong |
| `content='recipes'` (external) | no | ✅ | ✅ | wrong shape for versioning |

Both alternatives were built and tested. The contentless version works and is smaller, but every
column reads back `NULL`, so `snippet()` and `highlight()` return `NULL` too — confirmed
empirically, and matching the docs' statement that contentless tables *"store only the index,
returning NULL for all column values except rowid"*. You'd have to re-derive the matched fragment in
application code. Not worth it.

External-content is the mode the docs push hardest, but it points the FTS table at a real table via
`content_rowid`, and **there is no table here whose rowids are "the current version of each
recipe"** — `recipe_versions` is append-only, so external-content over it would index every
historical version. You'd need a materialised current-version table just to satisfy the index. That
is a table invented for the benefit of an index.

So: **plain `fts5`, storing its own copy of the text.** The cost is duplication. Measured on 300
recipes built from the real corpus:

```
base.db  912 KiB
fts.db  1616 KiB     (+704 KiB, ~77% overhead, ~2.3 KiB per recipe)
```

704 KiB. That is the entire argument for the more complicated modes, and it isn't one.

### Keeping it in sync with append-only versions

The map settles *"Append-only versions; no history UI"*. The index must hold **only the current
version**, and the current version is "the newest row in `recipe_versions` for this `recipe_id`".

That makes the sync rule trivial: **`rowid` of the FTS row = `recipes.id`.** One FTS row per recipe,
forever, regardless of how many versions accumulate. A new version deletes and re-inserts that one
row.

The docs' canonical trigger set (three triggers, `'delete'` commands, old values echoed back) is for
external-content tables and does not apply. For a plain FTS5 table over an append-only history,
**one trigger** does it — verified working:

```sql
CREATE VIRTUAL TABLE recipe_fts USING fts5(
  name, ingredients, instructions,
  tokenize = 'porter unicode61'
);

-- The only thing that keeps the index in sync. A new version is the only event that
-- changes a recipe's searchable text, so it is the only trigger there needs to be.
CREATE TRIGGER recipe_versions_ai AFTER INSERT ON recipe_versions BEGIN
  DELETE FROM recipe_fts WHERE rowid = new.recipe_id;
  INSERT INTO recipe_fts(rowid, name, ingredients, instructions) VALUES (
    new.recipe_id,
    new.data ->> '$.name',
    (SELECT group_concat(value ->> '$.text', ' ') FROM json_each(new.data, '$.ingredients')),
    (SELECT group_concat(value ->> '$.text', ' ') FROM json_each(new.data, '$.instructions'))
  );
END;
```

Test run, on an in-memory database:

```
trigger created OK
v1 'lentils': [ { rowid: 1, name: "Lentil dhal" } ]
v2 'spinach': [ { rowid: 1, name: "Lentil dhal with spinach" } ]
fts row count (must be 1): { c: 1 }
versions kept: { c: 2 }
```

Two versions stored, one index row, the superseded text gone from the index. The flattening happens
in SQL via `json_each` + `group_concat`, so the trigger reads the model's JSON directly — no schema
change to `data`, nothing for the write path to remember, and it is **impossible for application
code to forget to reindex**. Deleting a recipe needs
`DELETE FROM recipe_fts WHERE rowid = old.id` on a `recipes` delete trigger, when deletion exists.

Backfilling the existing rows is the same statement without the trigger wrapper — it ran against
`data/scran.db`'s 8 real recipes in one transaction.

### The query

```sql
SELECT r.id,
       v.data ->> '$.name'                              AS name,
       snippet(recipe_fts, 2, '<mark>', '</mark>', '…', 10) AS hit
FROM recipe_fts
JOIN recipes r ON r.id = recipe_fts.rowid
JOIN recipe_versions v ON v.id = r.current_version_id
WHERE recipe_fts MATCH ?
ORDER BY bm25(recipe_fts, 10.0, 5.0, 1.0)
LIMIT 20;
```

Against the real 8 recipes, with the user's raw string passed as the `MATCH` parameter:

| Query | Result |
|---|---|
| `muffins` | Chocolate Chip Muffins ×2 — **porter stemming**, the text says "muffins" and "muffin" |
| `roasting` | Roasted Pepper Panzanella — stemmed to `roast` |
| `caramelis*` | Greens & caramelised tofu — prefix, snippet: `…is thickened and «caramelised». Remove from the heat…` |
| `lemon OR tofu` | tofu recipe first (2 hits), pasta al limone second |
| `ingredients:pepper` | Roasted Pepper Panzanella — column-scoped |
| `pasta AND lemon` | the three pasta al limone versions |

`tokenize = 'porter unicode61'` is doing real work: `unicode61` is the default and *"removes
diacritics from Latin characters"* (so `sauté` matches `saute`), and `porter` *"applies porter
stemming to another tokenizer's output"* — which is what makes `lentils` find `lentil` and `roasting`
find `roasted`. For a recipe corpus, where plurals are everywhere, this is not optional.

**One caveat about passing user input to `MATCH`:** FTS5 query syntax is a real grammar. A search for
`chicken & rice` or an unbalanced `"` raises a syntax error rather than returning nothing. The fix is
one line — quote each whitespace-separated token and append `*` to the last one — not a parser.

---

## 3. Is it worth it at this size?

The ticket asks the right question, and the honest answer has two halves.

**On speed: no, none of this is needed.** Benchmarked with a synthetic corpus (200 words/recipe, a
rare term in ~2% of rows), comparing FTS5 against the dumbest possible alternative — `LIKE '%…%'`
over the raw `data` column, no index at all:

| Recipes | `fts5 MATCH` | `LIKE '%…%'` full scan | db size |
|---|---|---|---|
| 300 | 12.7 µs | 557 µs | 0.50 MiB |
| 3,000 | 42.5 µs | 1,797 µs | 4.78 MiB |
| 30,000 | 373 µs | 1,879 µs | 48.96 MiB |

FTS5 is ~40× faster, and **it does not matter**. 557 µs is invisible next to the ~1 ms of Hono
routing and JSON serialisation around it, let alone the network hop to a phone on the LAN. At the
catalogue size in the map — a few hundred recipes, five users — a `LIKE` scan would never be the
thing anyone noticed. Any argument for FTS5 that leans on the microseconds is fabricated.

**On behaviour: yes, and this is the whole case.** `LIKE` cannot do the things that make search feel
like search, and no amount of small-N hand-waving gets them:

- **Ranking.** `LIKE` returns rows in rowid order. `bm25()` puts the recipe *named* "Lentil Dhal"
  above the one that mentions lentils in step 6. With 30 hits out of 300, order is the feature.
- **Stemming.** `LIKE '%lentil%'` happens to match `lentils` — but `LIKE '%lentils%'` does not match
  `lentil`, and `LIKE '%roasting%'` never matches `roasted`. Porter handles both directions.
- **Multiple terms.** "what can I do with aubergines" is `aubergine AND …`, which in `LIKE` is one
  `AND data LIKE` clause per word, hand-assembled, with no relevance ordering across them.
- **Snippets.** `snippet()` returns the matched fragment with the term marked. Doing that by hand is
  more code than the entire FTS5 setup.

So the correct framing is: **FTS5 costs one `CREATE VIRTUAL TABLE`, one trigger, and 704 KiB, and
buys ranking, stemming and snippets.** It is cheaper than the `LIKE` query it replaces, once the
`LIKE` version has to rank and highlight. That — not throughput — is why to build it.

---

## 4. Vector search: sqlite-vec under Bun

`sqlite-vec` is *"an extremely small, 'fast enough' vector search SQLite extension"*, a Mozilla
Builders project, successor to `sqlite-vss`
([github.com/asg017/sqlite-vec](https://github.com/asg017/sqlite-vec)). Its README leads with:

> **IMPORTANT** — *`sqlite-vec` is a pre-v1, so expect breaking changes!*

It ships an npm package (`npm install sqlite-vec`) and does not mention Bun. It was tested anyway.

### It works under Bun — on Linux only

In `oven/bun:1-slim`, `bun add sqlite-vec` then `sqliteVec.load(db)` against a `bun:sqlite`
`Database`:

```
{ v: "v0.1.9" }
[ { recipe_id: 1, distance: 0.141421377658844 },
  { recipe_id: 2, distance: 1.2727922201156616 } ]
```

Full round trip: `CREATE VIRTUAL TABLE … USING vec0(...)`, insert `Float32Array`s, KNN query. Two
gotchas found: bind a `Float32Array`, not its `.buffer` (`bun:sqlite` rejects a bare `ArrayBuffer`),
and the npm `load()` helper's typing needs a cast for `bun:sqlite`'s `Database`.

**On macOS the same code cannot run at all.** `loadExtension` throws
`This build of sqlite3 does not support dynamic extension loading`, because Apple's SQLite is built
with `OMIT_LOAD_EXTENSION` (section 1). Working around it means `Database.setCustomSQLite()` pointed
at a Homebrew `libsqlite3.dylib`, on every dev machine, before any `Database` is constructed —
and that swaps the SQLite the whole app runs on, dev-only, so dev and prod stop sharing a database
engine. **That is the single strongest argument against sqlite-vec here**, and it has nothing to do
with vectors.

### Shape, if it were used

Per the project's KNN docs
([`site/features/knn.md`](https://github.com/asg017/sqlite-vec/blob/main/site/features/knn.md)):

```sql
create virtual table vec_recipes using vec0(
  recipe_id integer primary key,
  embedding float[1536] distance_metric=cosine
);

select recipe_id, distance from vec_recipes
where embedding match :query and k = 10;
```

It **sits beside FTS5 rather than replacing it** — a separate virtual table keyed on `recipe_id`,
joined back to `recipes`. Nothing about adding it later disturbs the FTS5 index. The two are
combined by running both and merging (reciprocal rank fusion or a weighted blend), which is
application code either way.

### But at 300 recipes it is the wrong tool

`sqlite-vec`'s own benchmark README is unusually candid
([`benchmarks/exhaustive-memory/README.md`](https://github.com/asg017/sqlite-vec/blob/main/benchmarks/exhaustive-memory/README.md)):

> Again **ONLY BRUTE FORCE LINEAR SCANS ARE TESTED**. This benchmark does **not** test approximate
> nearest neighbors (ANN) implementations.
>
> - Only brute-force linear scans, no ANN

**`sqlite-vec` has no ANN index.** `vec0` is a brute-force linear scan with better chunking and
storage than a plain table. It is not an index in the sense that FTS5 is an index — it makes the
scan faster, it does not avoid it. So the choice is not "index vs no index", it is "brute-force scan
in C inside SQLite" vs "brute-force scan in JS".

Measured, 300 vectors × 1536 dims, plain JS `Float32Array` dot products, no library:

```
brute-force cosine, 300x1536: 0.447 ms/query
embedding RAM: 1800 KiB
```

**0.45 ms and 1.8 MiB.** That is the whole semantic search implementation — roughly ten lines: keep
the embeddings in a `Float32Array[]` loaded at boot, dot-product against the query vector, sort, take
the top k. It needs no extension, has no pre-v1 dependency, works identically on macOS and in the
container, and costs nothing to delete. It stays viable to roughly 10,000 recipes (~15 ms/query),
which is 30× the ceiling the map describes.

The ticket's suspicion is correct, and stronger than stated: **a brute-force cosine scan doesn't
merely beat an index at this size, it is what `sqlite-vec` would be doing anyway.**

### Embedding cost

The 8 stored recipes average 2,046 characters of JSON, ≈510 tokens. For 300 recipes, ≈153k tokens:

| Model | $/1M tokens | 300 recipes | per recipe |
|---|---|---|---|
| `text-embedding-3-small` (1536 dims) | $0.02 | **$0.003** | $0.00001 |
| `text-embedding-3-large` (3072 dims) | $0.13 | **$0.020** | $0.00007 |

([developers.openai.com/api/docs/pricing](https://developers.openai.com/api/docs/pricing);
defaults per [the embeddings guide](https://developers.openai.com/api/docs/guides/embeddings):
*"By default, the length of the embedding vector is `1536` for `text-embedding-3-small` or `3072`
for `text-embedding-3-large`."*)

**Embedding the entire catalogue costs a third of a cent** — a rounding error against the ~3¢/recipe
already spent on extraction. Re-embedding everything after a prompt change is free. Cost is not an
input to this decision in either direction.

At query time it needs **one API call per search** to embed the query string — ~10 tokens, but
~100–300 ms of latency on the user's search box, and a hard dependency on OpenAI being reachable for
search to work at all. That latency, not the money, is the real cost of semantic search here, and
it's the strongest reason not to make it the default path.

The `dimensions` parameter shortens vectors (*"shorten embeddings … without the embedding losing its
concept-representing properties"*); at 300 recipes there is nothing to save, so use the default.

---

## RECOMMENDATION

### Build now: FTS5, and only FTS5

One virtual table, one trigger, one query. Roughly 20 lines total.

```sql
-- Index the current version of every recipe. Own-content mode: +704 KiB at 300 recipes,
-- and it buys snippet()/highlight() that contentless mode returns NULL for.
CREATE VIRTUAL TABLE recipe_fts USING fts5(
  name, ingredients, instructions,
  tokenize = 'porter unicode61'
);

-- rowid = recipes.id, so one index row per recipe no matter how many versions exist.
CREATE TRIGGER recipe_versions_ai AFTER INSERT ON recipe_versions BEGIN
  DELETE FROM recipe_fts WHERE rowid = new.recipe_id;
  INSERT INTO recipe_fts(rowid, name, ingredients, instructions) VALUES (
    new.recipe_id,
    new.data ->> '$.name',
    (SELECT group_concat(value ->> '$.text', ' ') FROM json_each(new.data, '$.ingredients')),
    (SELECT group_concat(value ->> '$.text', ' ') FROM json_each(new.data, '$.instructions'))
  );
END;
```

```ts
// Name matches beat ingredient matches beat instruction matches.
const search = db.query(`
  SELECT r.id, v.data ->> '$.name' AS name,
         snippet(recipe_fts, 2, '<mark>', '</mark>', '…', 10) AS hit
  FROM recipe_fts
  JOIN recipes r ON r.id = recipe_fts.rowid
  JOIN recipe_versions v ON v.id = r.current_version_id
  WHERE recipe_fts MATCH ?
  ORDER BY bm25(recipe_fts, 10.0, 5.0, 1.0)
  LIMIT 20`);

// FTS5 MATCH is a grammar, not a string. Quote each token so "chicken & rice" can't
// raise a syntax error; prefix the last so results appear while typing.
const toMatchQuery = (raw: string) => {
  const tokens = raw.trim().split(/\s+/).filter(Boolean).map(t => `"${t.replace(/"/g, '""')}"`);
  if (!tokens.length) return null;
  return [...tokens.slice(0, -1), `${tokens.at(-1)}*`].join(" AND ");
};
```

Why this and nothing else:

1. **It is available with no new dependency and no build flag**, verified by running it on both
   macOS 3.51.0 and the Linux container's 3.53.0.
2. **"What can I do with aubergines" is a lexical query** — the common case, and FTS5 answers it
   exactly, with ranking, stemming and highlighting.
3. **The sync story is one trigger**, so append-only versioning costs nothing and no write path can
   forget to reindex.
4. **704 KiB and ~20 lines.** There is no smaller thing that ranks and highlights.

Deliberately not built now: `description` and `notes` columns (add to the trigger when a search
visibly misses); a `trigram` index for substring matching (porter+unicode61 covers plurals and
accents, which is what recipes need); any query-syntax parser beyond `toMatchQuery`.

### Upgrade path, if lexical isn't enough

The second question in the ticket — *"something warming with lentils"* — is real, and FTS5 will not
answer it. `warming` is not a word in the corpus. But **don't pre-build for it**: it's plausible
that "lentils" alone surfaces the right four recipes out of 300, and that the user simply scrolls.
Ship FTS5, use it, and see whether the semantic query is a genuine miss or a hypothetical.

If it is a genuine miss, the upgrade is **not** sqlite-vec. In order:

1. **Add an `embedding BLOB` column to `recipe_versions`.** Embed name + ingredients + instructions
   with `text-embedding-3-small` at insert, in the same place the trigger fires. $0.003 to backfill
   the whole catalogue.
2. **Load them into a `Float32Array[]` at boot and brute-force cosine.** 0.45 ms/query, 1.8 MiB at
   300 recipes, ~10 lines, no extension, works on macOS. This is the ceiling for a long time —
   viable to ~10k recipes.
3. **Blend the two rankings** — run FTS5 and the cosine scan, merge with reciprocal rank fusion.
   Lexical still wins on "aubergine", semantic covers "warming". This is where the real design work
   is, and it is application code regardless of how the vectors are stored.
4. **Only then sqlite-vec**, and only if the in-memory scan measurably hurts — i.e. thousands of
   recipes, which the map rules out. Adopting it means solving the macOS extension problem first
   (`Database.setCustomSQLite` on every dev machine), and accepting a pre-v1 dependency that,
   by its own benchmark README, still only does brute-force scans. Note that step 3's blending code
   is unchanged by this swap; only where the vectors live changes.

The order matters: steps 1–2 are additive to the FTS5 design and disturb nothing. Nothing built now
has to be unpicked to get semantic search later.

---

## Verification appendix

Every empirical claim came from these, in this session:

| Claim | How |
|---|---|
| FTS5 on macOS | `bun run` on Bun 1.1.42 / SQLite 3.51.0: `PRAGMA compile_options` + full `MATCH`/`bm25`/`snippet`/`highlight` round trip |
| FTS5 on Linux | same script in `docker run --rm oven/bun:1-slim`, Bun 1.3.14 / SQLite 3.53.0 |
| `SQLITE_ENABLE_FTS5: 1` | `gh api repos/oven-sh/bun/contents/scripts/build/deps/sqlite.ts` |
| macOS blocks extensions | `db.loadExtension()` → `This build of sqlite3 does not support dynamic extension loading` |
| Linux allows extensions | same call → `cannot open shared object file` (reached `dlopen`) |
| sqlite-vec works under Bun | `bun add sqlite-vec` + `vec0` KNN in the Linux container, `vec_version() = v0.1.9` |
| Trigger keeps one row per recipe | two versions inserted, `count(*) = 1` in FTS, superseded text unfindable |
| Stemming/prefix/snippet/column-scope | queries run against the 8 real recipes in `data/scran.db` |
| FTS5 vs `LIKE` at 300/3k/30k | 500-iteration timed loops, rare-term query, no `LIMIT` short-circuit |
| +704 KiB index overhead | two `VACUUM`ed file databases, 300 rows built from the real corpus |
| 0.45 ms brute-force cosine | 1,000-iteration timed loop, 300×1536 `Float32Array` |
| Embedding cost | measured avg 2,046 chars/recipe × 300 ÷ 4 chars/token × published $/1M |

**Primary sources**

- [bun.com/docs/api/sqlite](https://bun.com/docs/api/sqlite) — platform SQLite, `loadExtension`, `setCustomSQLite`
- [oven-sh/bun `scripts/build/deps/sqlite.ts`](https://github.com/oven-sh/bun/blob/main/scripts/build/deps/sqlite.ts) — build defines
- [sqlite.org/fts5.html](https://sqlite.org/fts5.html) — FTS5 reference: content modes, triggers, `bm25`, tokenizers, `snippet`
- [sqlite.org/compile.html](https://sqlite.org/compile.html) — `SQLITE_ENABLE_FTS5` is opt-in upstream
- [github.com/asg017/sqlite-vec](https://github.com/asg017/sqlite-vec) — README, [KNN docs](https://github.com/asg017/sqlite-vec/blob/main/site/features/knn.md), [benchmark README](https://github.com/asg017/sqlite-vec/blob/main/benchmarks/exhaustive-memory/README.md)
- [developers.openai.com/api/docs/pricing](https://developers.openai.com/api/docs/pricing) and [embeddings guide](https://developers.openai.com/api/docs/guides/embeddings)
