# Lock the multi-user, versioned data model

Type: grilling
Status: resolved
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

## Answer

**Six tables of our own beside Better Auth's four, versions append-only with the current one being
the highest, and the recipe's three list fields left as JSON while every scalar is lifted into a
column.** The vocabulary this settled is in [CONTEXT.md](../../../CONTEXT.md).

```sql
recipe            id, status ∈ (pending|ready|failed), createdByUserId,
                  createdAt, updatedAt, deletedAt

recipeVersion     id, recipeId, versionNo, createdByUserId,
                  name, description,
                  recipeYield, yieldQuantity, yieldUnit,
                  totalTime, prepTime, performTime,
                  ingredients, instructions, notes,            -- JSON arrays
                  model, promptVersion, tokensIn, tokensOut,
                  createdAt, updatedAt
                  UNIQUE (recipeId, versionNo)

source            id, recipeId, kind ∈ (photo|html), path, url, createdAt, updatedAt

rating            id, recipeId, userId, score ∈ (1,2,3), createdAt, updatedAt
                  UNIQUE (recipeId, userId)

comment           id, recipeId, userId, body, createdAt, updatedAt, deletedAt

invite            id, tokenHash, email, expiresAt, createdByUserId,
                  redeemedAt, redeemedByUserId, createdAt, updatedAt

recipeSearch      fts5(name, ingredients, instructions), rowid = recipe.id
```

`ingredients` is `{title, text, quantity, unit, food, note}[]`; `instructions` and `notes` stay
`{title, text}[]`.

### The reasoning, split by split

**Conventions: Better Auth's style, with one deliberate divergence.** Ticket 01 locked Better Auth,
which imposes `user`/`session`/`account`/`verification` — singular names, camelCase columns,
ISO-8601 strings. Rather than run two house styles in one file, ours match: singular tables,
camelCase columns, TEXT timestamps. The divergence is the **`INTEGER PRIMARY KEY`**, because
ticket 02's FTS index is keyed `rowid = recipe.id` and a TEXT id would mean maintaining a mapping
between the index and the table for no gain. Better Auth's four tables are a **vendor island** —
migrated by their CLI, not ours; the only thing crossing the seam is `userId TEXT`.

**Current means highest `versionNo`, not a pointer.** A `recipe.currentVersionId` can disagree with
the rows it points at, and it would have forced ticket 02's `AFTER INSERT ON recipeVersion` trigger
to move to `AFTER UPDATE ON recipe`. Highest-wins keeps append-only pure and the settled trigger
intact. Reverting is re-appending a copy of the old version, which is honest history rather than a
pointer quietly rewinding.

**Scalars lifted, lists left as JSON — and the line is 1:1 versus 1:N.** Full normalisation
(`ingredient`/`instruction`/`note` child tables) loses to append-only versioning: a version is one
row today, and normalised it becomes one row plus ~16 children *copied wholesale on every edit*,
so fixing a typo in the title rewrites sixteen rows. It also breaks ticket 02's trigger, which
works precisely because the version row is self-contained. And it buys nothing: "recipes containing
butter" is FTS, already settled; editing one line writes a whole new version either way; there is
no foreign key being missed, because an ingredient line is text with an optional overlay, not an
entity. The asymmetry even runs the *other* way for the future — adding a field to a JSON array of
objects is a zero-migration change, while adding a column to an `ingredient` table is an
`ALTER TABLE` plus a backfill. So the scalars, which are 1:1 with the version and cost nothing to
type, become real columns; the three lists stay atomic with the version they belong to.

**Extraction metadata is columns on the version, and the sidecar JSON dies.** A run that succeeds
*is* a version — same row, no join, no second artifact to keep in sync. A run that fails produces
no version and lives in the logs, per ticket 07. `model IS NULL` therefore means **a person wrote
this version**, which is the check the retry rule wants and the "captured by" / "corrected by"
distinction reads from. An explicit `origin` enum was rejected as a second source of truth that can
disagree with the metadata beside it.

**Attribution and authorship are two facts.** `createdByUserId` is `NOT NULL` on every version —
uploading a photo is an act of authorship, and someone always did it. Who wrote the *words* is a
different question, answered by `model`. Collapsing them into one nullable `authorUserId` loses the
retry check; a seeded "scran" user row to own extractions was rejected outright (it leaks into
every list of people, needs a fabricated email, and could log in).

**`status` is explicit, not derived.** Ticket 07 requires the recipe row to exist as `pending`
before the LLM call so a failure is retryable from the photo already on disk. The retry UI must
distinguish `failed` from still-running, and derivation can only guess that from a timestamp.

**Sources are a table, 0..N per recipe, artifacts only.** The deciding case is a cookbook spread
photographed as two pages — the prototype's one-photo-one-recipe assumption is dead. `kind` is
`photo|html` and nothing else: a typed-in recipe has no artifact, so a `kind = 'user'` row would be
all-null payload existing to say "nothing here". Typed-in is expressible as **no source row**, and
"how did this arrive" stays derivable.

**Ratings are per recipe, and the mean is never shown.** You rate the dish, not somebody's typo
fix — per-version ratings would reset every time anyone corrected a comma. The scale is the
household's own: **cross** (don't make this again), **tick** (make this again), **double tick**
(good enough to cook for other people), stored `1|2|3` so "best rated" can sort. But the surfaced
figure is the **spread**, not the average: one cross and one double tick average to 2, "tick",
*fine* — when what actually happened is somebody won't eat it. Three counts from one `GROUP BY`
preserves the veto that a mean destroys.

**Comments are flat, on the recipe, and are not notes.** The frozen extraction schema already has
`notes` — the *page's* headnotes, inside the recipe content. Two concepts, one word, and only one
of them was renameable. Threading was rejected on population size.

**Nothing is hard deleted.** `deletedAt TEXT NULL` on `recipe` and `comment` — NULL means alive, a
timestamp means deleted *and* when, which is both halves of the NoSQL `status: deleted` plus
history in one column. A separate status enum alongside it would be two sources of truth that can
disagree. Ratings are overwritten rather than deleted. Recovery is a SQL statement; there is no
trash UI at five users. The FTS index drops the row when `deletedAt` is set.

**Permissions: anyone edits, creator-only deletes.** Enforced in code, not the schema. A typo fix
is append-only and fully attributed, so the worst case is a bad edit anyone can see and supersede —
that is what versioning bought. Deletion is the destructive one, so it stays with
`recipe.createdByUserId`. Comments you can only delete if they're yours, because that one is about
voice, not access.

### Two decisions this reversed, both upstream of it

**Re-extraction does not exist.** Two things wore the name. **Retry** — a first extraction that
failed or never finished, re-run from the photo on disk — is required by ticket 07 and has no
versioning problem, because there is no version yet to bury. **Re-extraction proper** — re-running
the model over a recipe that already has content — would silently supersede every human correction
under highest-wins, and only pays off as a sweep across many recipes, which the map has no eval
harness to judge. Dropped. Sources are kept permanently, so a prompt-improvement sweep remains
available later as a *script*, never as a button.

**Ingredients get machine-readable quantities, so the extraction schema is no longer frozen.**
The map's Notes said the response schema in `extract.ts` survives verbatim, and its Out-of-scope
said scaling was "ruled out flatly". The second was a misreading: the prototype map *deferred*
scaling — "whichever gets built first is what forces ingredients to be structured" — and prototype
ticket 03 said outright that "when shopping lists or scaling actually get built, that's when
ingredients get structured". Scaling is wanted, so this is that moment.

The change is **additive**, which is why it's cheap: `{title, text}` becomes
`{title, text, quantity, unit, food, note}`, and `text` — already the field name — *is* Mealie's
`originalText`. The existing 7 recipes stay valid with nulls. `display` was dropped as derivable.
Ranges follow Mealie: **take the lower number**, and `text` carries the truth, so `"2-3 cloves"`
still reads as written until someone scales it. `recipeYield` splits the same way into
`yieldQuantity` + `yieldUnit` with the verbatim string kept, so the UI can offer a "serves 4"
stepper and fall back to raw multiplier buttons where the parse is null.

**The invariant, and it belongs in the UI too**: `text` is what the page said; the parsed fields
are a best-effort overlay on it. Never render a scaled line from parts you don't have — fall back
to `text` and **mark the line as unscalable**, so a user is never shown a quantity the model
invented.

The extraction schema and prompt change is [its own ticket](10-machine-readable-quantities.md).
The scaling UI is fog. Note the honest limitation carried forward: nothing here tells you whether
the quantity parsing got *better or worse* — that is the eval harness, still out of scope.

### Loose ends handed on

- **`invite.createdByUserId` is nullable** — the first invite has no creator, because nobody exists
  yet. Seeded by hand at deploy; ticket 05's problem.
- **The 7 existing recipes** carry no quantities and must be re-extracted from their photos to gain
  them. Part of the migration, still fog.

## Amendment from [ticket 06](06-look-and-feel.md)

Two of this ticket's conclusions were **deliberately overridden** once the UI existed to judge
them. Both were the human's call, made with the trade-off stated.

- **"Surfaced as a spread, never a mean — an average erases a veto."** The *never a mean* part
  stands. The *spread* part does not: five sets of initials down a list column is noise. The
  catalogue now shows a **single collapsed mark** — the **modal rating, ties rounding down** — over
  a chosen scope. This **can hide a lone veto** (three ticks and one cross reads as a tick), and
  that was accepted knowingly in exchange for a list that reads at a glance. Full per-person
  attribution survives on the recipe page, which is one tap away. The minimum was tried and
  rejected: it makes one grumpy rating indistinguishable from household-wide rejection.
- **Ratings are per-user with no group.** Still true in the schema, but the catalogue scopes its
  mark to **Everyone / Our house / Me**, and nothing here can answer what "our house" is. A
  per-person picker would have needed no schema and was rejected as faff in use. Whether
  `household` becomes a table is [ticket 20](20-households.md); it amends this model, and possibly
  [ticket 01](01-auth-and-sessions.md)'s invites.
- Unrelated, and confirming rather than overriding: the **stepper / multiplier split** above is
  exactly what got built, and the "mark the line unscalable" invariant survived contact with real
  data. See the amendment on [ticket 10](10-machine-readable-quantities.md) for what scaling still
  owes — rounding must be unit-aware, and must never snap lines independently, because that drifts
  the ratios between them.

## Amendment from [ticket 19](19-tags.md)

An **eighth table**, `recipeTag(recipeId, tag, PRIMARY KEY (recipeId, tag))`, and a departure from
this ticket's rule that extraction output is versioned. Tags are produced by extraction but hang off
**`recipe`**, not `recipeVersion`: filtering the catalogue is the primary query and wants an index
lookup rather than a `json_each` over a correlated `MAX(versionNo)`, and a tag labels the *dish*
rather than reproducing the page — so the append-only guarantee, which exists to stop a human's edit
destroying the model's reading of the page, has nothing to protect here. The cost is real and
accepted: **the model's original tags are not recoverable** once someone corrects them.

`recipeVersion` also gains `totalMinutes` and `timeEstimated` — see the amendment on
[ticket 10](10-machine-readable-quantities.md), which owns them.

The `tag` values themselves are **not** a table: a closed vocabulary of ten lives as a TS constant
in `shared/`, so there is no foreign key and a stale id is ignored on read.
