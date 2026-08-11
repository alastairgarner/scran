# Build the server foundation

Type: task
Status: resolved
Assignee: alastair
Blocked by: 05

## Question

Nothing else can be built until the skeleton ticket 05 specified exists. This is that skeleton, and
nothing beyond it — no recipes, no extraction, no auth.

- `config.ts` — zod over `process.env`, parsed at import, throwing with the missing names listed.
  `DATA_DIR`, `DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `LOG_LEVEL`, `PORT`, `BASE_URL`,
  `COOKIE_SECURE`. Nothing else in the codebase may read `process.env` after this.
- `db.ts` — `bun:sqlite` connection plus a migration runner over numbered `.sql` files.
- `migrations/` — ticket 04's six tables and ticket 02's FTS table and trigger, written out as SQL.
  Better Auth's four tables are **not** here; its CLI owns them.
- `errors.ts` — ticket 07's `AppError` / `ClientError` split, lifted from `~/forte/sn-web`
  (`shared/errors/src/`) minus Sentry, with `severity` mapping to log level.
- `logger.ts` — pino to stdout, `pino-pretty` in dev, request id on every line via
  `hono/request-id`.
- `storage.ts` — the only module that knows where bytes live. Reads `DATA_DIR`. Save and read a
  photo or an HTML artifact by source id; no path is ever constructed elsewhere.
- The `shared/` workspace itself: `package.json`, `tsconfig.json`, added to the root workspaces
  array, depending on zod and nothing else. The client's `verbatimModuleSyntax` and the Biome rule
  banning value imports from `@scran/server` land here too.
- Hono app with the single `onError`, a health route, and `bun run check` clean.

Bun is on 1.1.42 and ticket 08 said it wants upgrading — do it here, before any of this is written.

Done when `bun run dev` boots, applies migrations to an empty database, and fails loudly and
usefully with an env var missing.

## Answer

Built as specified, in the `Scaffold backend` commit — this ticket was left `open` by an oversight
and is marked resolved retrospectively.

`server/src/` holds `config.ts`, `db.ts`, `errors.ts`, `logger.ts`, `storage.ts` and `index.ts`,
with `bun:test` unit tests beside config, db, errors and storage. `migrations/001-init.sql` carries
ticket 04's six tables (`recipe`, `recipeVersion`, `source`, `rating`, `comment`, `invite`) plus
ticket 02's `recipeSearch` FTS5 virtual table and both of its triggers — insert on `recipeVersion`
and the soft-delete update on `recipe`. Better Auth's four tables are absent, as intended. `index.ts`
exposes `/api/health` behind a single `onError`, and `shared` is in the root `workspaces` array.

**Bun was upgraded** as the ticket required — 1.1.42 → **1.3.14**.

Subsequently amended by [ticket 20](20-households.md): a seventh table, `householdMember`, arrives
as a **new numbered migration** rather than an edit to `001-init.sql`, since this one has already
run. That work belongs to [ticket 22](22-settings-and-households-build.md).
