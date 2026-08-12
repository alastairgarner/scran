# Build the recipes module and the extraction pipeline

Type: task
Status: resolved
Assignee: alastair
Blocked by: 11, 12, 10, 19

## Question

The core of the application: the deep `recipes` module ticket 05 specified, and the asynchronous
photo-capture pipeline that feeds it. Server only — the UI waits on ticket 06.

- **`recipes.ts`** — `create`, `addVersion`, `get`, `list`, `search`, `rate`, `comment`,
  `softDelete`. It hides `versionNo = max + 1`, current-is-highest, `deletedAt` filtering on every
  read, and the anyone-edits / creator-only-deletes rule. No route may contain SQL or a permission
  `if`.
- **`extraction/`** — `extract(source, deps = { complete })`, the zod content schema in `shared/`
  (with ticket 10's quantities), the JSON Schema generated from it, and the model's reply parsed
  back through it before anything is trusted. A schema-invalid reply is `AppError.dependency`.
- **The asynchronous capture path**: `POST /api/recipes` saves the source via `storage`, creates the
  `pending` recipe, returns **202 with the id**, and runs extraction as a floating promise that
  moves the row to `ready` or `failed`.
- **The stale-pending sweep at boot** — rows pending for more than ~10 minutes become `failed`, so a
  restart mid-extraction leaves something retryable rather than something stuck.
- `POST /api/recipes/:id/retry`, valid only where no version exists. There is no re-extraction.
- The rest of ticket 05's route table, minus URL import: list with `?q=` FTS, detail, versions,
  delete, rating, comments, `GET /api/photos/:sourceId`.
- **Tests**: unit tests on the pure logic, and integration tests through `app.request()` against
  `:memory:` SQLite with a **recorded** OpenAI response captured from one of the seven photos and
  committed under `extraction/fixtures/`. No live calls in the suite.

Verify early, because it changes the shape of `extraction/`: does `z.toJSONSchema` preserve the
field descriptions that carry the extraction instructions, under OpenAI strict mode? If not, ticket
05 named the fallback — hand-written JSON Schema out, zod on the way back in.

Done when a photo posted to the API becomes a `ready` recipe with a version, a failed extraction
leaves a retryable `failed` row with the photo still on disk, and the suite passes offline.

## Amendment from [ticket 19](19-tags.md)

Tags ship **here**, minus their editing UI: the `recipeTag` table, the ten-tag vocabulary constant
in `shared/`, the `enum`-constrained `tags` array on the extraction schema, the `vegan` ⇒
`vegetarian` normalisation on write, and the rebuilt `recipeSearch` with its tags column and second
trigger. One edit to `extract.ts` shared with [ticket 10](10-machine-readable-quantities.md), which
lands the same prompt change and `totalMinutes` beside it.

Not here: filter chips ([ticket 21](21-client-build.md)) and tag correction
([ticket 18](18-recipe-editor.md)).

## Answer

**Built.** A photo posted to `/api/recipes` comes back as a 202 and an id, the model reads it behind
the response, and the row turns `ready` with version 1 and its tags. 61 tests pass offline;
`bun run check` is clean.

### The verification the ticket asked for first — `z.toJSONSchema` wins

`z.toJSONSchema(extractionSchema, { target: 'draft-7' })` preserves **every field `description`**,
emits `additionalProperties: false`, and marks all fourteen properties required — which is exactly
what OpenAI strict mode demands. Checked against the live API, not by reading docs: a real call on a
real photo returned the same quality of result ticket 10 recorded. **Ticket 05's fallback
(hand-written JSON Schema out, zod on the way back in) is not needed**, so the contract is defined
once, in zod, in `shared/`.

Nullable fields come out as `anyOf: [{type}, {type: 'null'}]` rather than `type: [t, 'null']`. Both
are accepted; this was the one real risk in the conversion and it isn't one.

### The shape that landed

- **`shared/src/recipe.ts`** — `extractionSchema` (the model contract, snake_case, Mealie's names,
  the descriptions carrying the instruction) and `recipeContentSchema` (the stored shape, camelCase,
  matching the columns, and what an edit posts). `toRecipeContent` is the **only** crossing between
  them, so nothing downstream of extraction ever learns Mealie's naming. Ticket 19's tag constant
  moved to `shared/src/tags.ts` so the schema can import `TAG_IDS` without a cycle.
- **`extraction/`** — `extract(source, deps = { complete })`, `openai.ts` holding everything about
  the wire. `prompts/` and `fixtures/` moved under it. The old `extract.ts` is deleted.
- **`recipes.ts`** — the deep one, as specified.
- **`http/recipes.ts`** — the route table minus URL import. No SQL, no permission `if`.
- **`002-tags-and-time.sql`** — see below.

### Calls made while building

**A `002` migration, not a fold into `001`.** Ticket 19 left this as a build-time call: fold if
`001` has never run anywhere that matters. It has — the dev database still holds the prototype's
**nine `recipes` rows**, which are ticket 17's input and not recreatable. So `002` adds
`totalMinutes`, `timeEstimated`, `recipeTag`, and drops and recreates `recipeSearch` with its `tags`
column and both triggers.

**A `tagSearch` table — a ninth table, and the one thing here ticket 19 did not authorise.** The
synonyms have to reach the index, the index is maintained by triggers, and **a trigger cannot read a
TypeScript array**. Options were: denormalise the synonym string onto every `recipeTag` row, or
project the constant into ten rows at boot. The projection wins because *adding a synonym stays the
one-line change ticket 19 promised* — with the denormalised column, editing `TAGS` would silently
fail to reach recipes already tagged. `syncTagSearch()` runs at boot; `shared`'s `TAGS` is still the
only source of truth.

**bm25 where there is a query, newest-first where there is not.** Ticket 02 bought FTS5 partly for
ranking, and the first draft ordered everything by `createdAt`. Search now orders by `hit.rank`.
Snippets are still unbuilt — ticket 06's catalogue is name-first with no result excerpt, so there is
nowhere to put one yet.

**`retry` refuses a run already in flight.** "Valid only where no version exists" is not sufficient
on its own: a `pending` row has no version either, so retrying one started a *second* concurrent
extraction that would append a second version and write the tags twice. Now 409.

**The stale sweep keys on `updatedAt`, not `createdAt`.** `retry` moves a row back to `pending`
without touching `createdAt`, so a recipe captured an hour ago was stale the instant it was retried
— it got failed again before the model could answer.

**A failed `saveSource` fails the recipe immediately** rather than leaving it pending for the sweep
to find ten minutes later.

**Routes are registered as one chained expression, and `AppType` is exported.** Hono's RPC types come
from the chain; registered statement by statement, `hc<AppType>` would infer an app with **no
endpoints** and ticket 21 would discover that rather than this ticket. Verified by compiling a
throwaway client against it.

### Testing, and the seam

The recorded fixture plugs in exactly where ticket 05 said: `recordedComplete()` from `testing.ts` is
a `Complete`, handed to `extract` or `runExtraction` as a defaulted parameter. No framework.

The HTTP capture test has no such parameter to reach — the route fires extraction as a floating
promise — so `withoutOpenAI` replaces **`fetch`** with the same recorded body for the duration, and
throws on any request that isn't to OpenAI. That test drives the ticket's done-criterion end to end:
POST a photo, poll, `ready`, version 1, tags, and the photo served back by source id.

One test parses all four fixtures through `extractionSchema`, so a fixture that drifts from the
schema fails loudly instead of passing while the real thing is broken.

### Not done here, deliberately

- **`PUT /api/recipes/:id/tags` was built and then removed.** Tag correction is
  [ticket 18](18-recipe-editor.md)'s, per ticket 19; `setTags` exists behind the seam, unexposed.
- **`recipes.ts` is 603 lines** and ticket 05 said ratings and comments move out past ~300. Left
  whole: they share `requireAlive` and the soft-delete rule, and splitting now would export it. The
  honest trigger for the split is [ticket 22](22-settings-and-households-build.md) or
  [18](18-recipe-editor.md) adding to them.
- **`capture` is not in [CONTEXT.md](../../CONTEXT.md)'s glossary** although it is now the codebase's
  central verb. A domain-doc change, not a build one.
