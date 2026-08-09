# Build the recipes module and the extraction pipeline

Type: task
Status: open
Blocked by: 11, 12, 10

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
