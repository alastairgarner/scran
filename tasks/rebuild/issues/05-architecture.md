# What shape does the rewritten codebase take?

Type: grilling
Status: resolved
Assignee: alastair
Blocked by: 01, 04

## Question

The prototype is 513 lines: one Hono file, one `extract.ts`, one 154-line `main.tsx` with no
router and no data layer. Auth, editing, versioning, search and URL import all land on top of it.
Decide the shape *before* any of them get built, or they'll each invent their own.

- **Server modules.** What are the seams — extraction, sources/storage, recipes, auth, HTTP? What
  does each expose, and what does the HTTP layer do beyond parse-validate-delegate? Consult
  `/mp-codebase-design`: the test is whether a module is deep enough to hide a decision.
- **Two ingestion paths, one pipeline.** Photo and URL differ at the front (upload vs fetch) and
  at the prompt, and are identical after. Where exactly does the seam go?
- **Validation at the boundary.** The prototype had none. What validates a request body, and what
  validates the *model's* response against the schema before it's trusted?
- **Client structure.** Router and routes; a data-fetching layer with caching; where forms and
  their validation live; how components are organised against ticket 03's tokens.
- **Shared types.** Server and client are separate workspaces. Does a shared package appear, or do
  types get inferred across the boundary?
- **Config.** `.env` on a laptop becomes env vars in a container. What's read where, and what
  fails loudly at boot when missing (the prototype silently ran without `OPENAI_API_KEY` loaded
  for two tickets).
- **What the test suite looks like** against this shape — where the recorded-response fixture
  plugs in.

Done when the module boundaries and the client structure are written down well enough that the
build tickets that follow have no room to disagree.

## Answer

**Three workspaces, raw SQL, zod as the single schema language, and one deep `recipes` module that
owns every versioning invariant.** No global state library on the client: server state, URL state
and form state have three separate owners and nothing is left over.

### The shape

```
shared/          zod schemas + inferred types. Dependency: zod. Nothing else, ever.

server/src/
  index.ts       boot: config → db → migrations → stale-pending sweep → routes → serve
  config.ts      zod over process.env, parsed at import, throws listing what's missing
  db.ts          bun:sqlite connection + migration runner
  migrations/    001-init.sql … — ticket 04's DDL, ticket 02's FTS trigger
  errors.ts      AppError / ClientError — ticket 07
  logger.ts      pino + request id
  auth.ts        Better Auth instance; invite create/redeem
  storage.ts     the ONLY module that knows where bytes live
  extraction/    extract(source) → RecipeContent; prompts/, openai.ts, fixtures/
  recipes.ts     the deep one: create, addVersion, get, list, search, rate, comment, softDelete
  http/          routes: validate → delegate → c.json. Nothing else.

client/src/
  main.tsx       QueryClientProvider, RouterProvider, RequireAuth
  theme.css      ticket 03's tokens
  routes/        list, recipe, edit, capture, login, signup
  components/    ticket 03's four hand-written ones + native <dialog>
  api/           hc client, query keys, hooks — one file per resource
```

**`recipes.ts` is the module that has to be deep**, and the test is which decisions it hides:
`versionNo = max + 1`, current-is-highest, `deletedAt` filtering on every read, and the
anyone-edits / creator-only-deletes rule. Every one of those is re-derivable at a call site and
exactly one call site will get it wrong. Ratings and comments start as functions in the same file
and move out if it passes ~300 lines — they share the recipe's permission and soft-delete rules,
so splitting them early buys nothing.

**`storage.ts` is insurance the map explicitly asked this ticket for.** A photo path is never
constructed anywhere else, so object storage later is one module rather than a grep. It reads
`DATA_DIR` from config, which is also how the photo directory becomes a bind mount without a code
change.

**The HTTP layer does only parse-validate-delegate.** Auth is one middleware setting
`c.set('user')`; errors are thrown and caught by ticket 07's single `onError`. No route contains a
SQL statement or an `if` about permissions.

### Raw SQL, not an ORM

Ticket 04's schema is already written as DDL, ticket 02's index is maintained by a SQL trigger, and
Better Auth ships a first-party `bun:sqlite` dialect that needs no ORM of ours. Drizzle would buy
typed queries and cost a second schema definition that can disagree with the one already settled.
Numbered `.sql` files run at boot; row types are hand-written beside the queries that return them.
The ceiling: if those types start drifting from the schema, Drizzle is a contained swap, because
only `recipes.ts` and `auth.ts` touch SQL at all.

Better Auth's four tables stay a **vendor island** — its own CLI migrates them, ours never touch
them, per ticket 04.

### zod is the only schema language

- **Request bodies** — `@hono/zod-validator` on every route that takes one. The prototype had no
  validation at all.
- **The model's response** — parsed against the same zod schema before anything is trusted. A
  schema-invalid reply is `AppError.dependency` per ticket 07: the request was fine, the upstream
  wasn't.
- **The JSON Schema OpenAI receives** is generated from that zod schema (`z.toJSONSchema`), so the
  contract is defined once.
- **Client forms** resolve the same schema through react-hook-form.

**One thing to verify before ticket 10 rewrites the schema**: the conversion has to preserve the
field `description`s — in `extract.ts` those descriptions carry most of the extraction *instruction*,
not just the shape — and OpenAI strict mode demands `additionalProperties: false` on every object.
If that fight isn't winnable, the fallback is a hand-written JSON Schema for the model and zod for
the parse of its reply; the contract is then defined twice, which is why it's the fallback.

### Config fails loudly at boot

One `config.ts`: a zod schema over `process.env`, parsed at module load, throwing with the missing
names listed. **Nothing else in the codebase reads `process.env`.** The prototype ran for two
tickets without `OPENAI_API_KEY` loaded; this is the fix.

It carries `DATA_DIR`, `DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `LOG_LEVEL`, `PORT`, and —
the pieces ticket 01 handed down — `BASE_URL` and `COOKIE_SECURE`. That last one is the entire TLS
story that's in scope: `Secure` off on the LAN, on in public, one variable at deploy time.

### Two ingestion paths, one seam

Photo and URL differ **only** in acquiring the artifact. `storage` saves photo bytes or fetched
HTML; `extract(source)` dispatches on `source.kind` to pick the prompt and the message shape, and
returns one validated `RecipeContent` either way. Everything after — version row, FTS, response —
is a single path that never learns which kind it was. Two prompts, one schema, one validation, one
write path.

The rejected alternative is two pipelines converging at the database, which duplicates the
version-writing logic — the one part that must never diverge.

### Capture is asynchronous, and the client polls

The prototype awaits the model inside the request: a 20–30 second hanging POST from a phone. Ticket
07 already forced the recipe row to exist as `pending` before the call, so the change is small:

1. `POST /api/recipes` saves the source and creates the `pending` recipe,
2. returns **202 with the recipe id immediately**,
3. extraction runs as a floating promise and writes version 1, moving the row to `ready` or
   `failed`,
4. the client polls with Query's `refetchInterval` while status is `pending`.

It costs one line client-side and buys photographing the second page of a spread without waiting.
Retry falls out for free — polling and retrying read the same status field.

**The honest cost**: a process restart mid-extraction strands a row at `pending`. Boot marks
pending rows older than ~10 minutes as `failed`, which is retryable from the photo already on disk.
Five lines, and it is the same sweep a real queue would need.

### Three workspaces, and RPC on top

`shared/` holds the zod schemas and the types inferred from them; it depends on zod and nothing
else, so the dependency direction makes "no server code in the browser bundle" structural rather
than a convention. Hono's `hc<AppType>` client then gives typed endpoint calls with no hand-written
request/response types.

RPC requires the client to see the server's `AppType`, and that import exists either way. The
guardrail is that it can never become a *value* import: `verbatimModuleSyntax` in the client
tsconfig plus a Biome rule banning non-type imports from `@scran/server`, so a mistake fails
`bun run check` instead of shipping `bun:sqlite` to a phone.

### Client: three state owners, no store

| State | Owner |
| --- | --- |
| Server data — recipes, ratings, comments, session | TanStack Query |
| Where you are — route, search query | React Router v7, declarative |
| Half-typed form values | react-hook-form + zod resolver |

**No Redux, no Zustand.** Most global stores turn out to be a hand-rolled server cache — a fetched
list, a loading flag, a stale flag — which is Query's job done properly. Once Query owns server
state, nothing is left: the current user is `authClient.useSession()` (server state, and Better
Auth ships it), the theme is a `data-theme` attribute per ticket 03, and the open recipe is a URL.
The trigger to add one is genuinely client-only state shared across routes that doesn't belong in
the URL — a multi-step capture wizard would be the honest case.

**Form state deliberately does not live in a store.** It's per-keystroke and dies on submit; in a
store every keystroke re-renders the subscribed subtree, which for a recipe edit form is ~20
ingredient lines plus instructions. react-hook-form keeps inputs uncontrolled and subscribes per
field. `useFieldArray` is also what makes adding, removing and reordering ingredient lines
tractable — that's the part of the hand-edit surface worth not writing by hand.

**Query hooks live in `api/`, one file per resource**, exporting the query keys alongside them.
Invalidation depends on keys matching exactly, and a misspelt key in a route-local hook is a stale
list nobody notices for a week.

Auth is a `<RequireAuth>` route wrapper: `isPending` → spinner, no session → redirect to login. The
client's copy of the session is for *drawing* — showing a name, hiding a delete button — never for
access control. Every API route checks the session server-side; if the client's copy is wrong the
worst case is a button that 403s.

### Routes

```
POST   /api/auth/*                  Better Auth (sign-in, sign-up, sign-out, session)
GET    /api/recipes[?q=]            list; FTS when q is present
POST   /api/recipes                 capture: multipart photo, or {url} → 202 {id, status}
GET    /api/recipes/:id             recipe + current version + sources + ratings + comments
POST   /api/recipes/:id/versions    an edit — appends
POST   /api/recipes/:id/retry       re-run extraction; only valid with no version yet
DELETE /api/recipes/:id             soft delete, creator only
PUT    /api/recipes/:id/rating      upsert own rating
POST   /api/recipes/:id/comments
DELETE /api/comments/:id            own comments only
GET    /api/photos/:sourceId        streamed via storage, auth-gated
```

Photos are addressed by **source id, not filename** — the path never appears in a URL, so path
traversal isn't a class of bug that exists, and `storage` keeps its monopoly on paths. There is no
re-extraction endpoint: ticket 04 removed it.

### Tests

`extract(source, deps = { complete })` takes the chat client as a **defaulted parameter** —
production callers pass nothing, tests pass a recorded response. Two real adapters, so a real seam,
and no DI framework. The fixture is a genuine captured response body from one of the seven photos,
committed under `extraction/fixtures/`; the map already noted that this is most of an eval harness
when one graduates back in.

Integration tests drive the whole app through Hono's `app.request()` — no port, no server, no
supertest — against `:memory:` SQLite running the same migrations. Auth is obtained by signing up
through the real invite-and-signup route once per file, which exercises ticket 01's `POST`-redeems
path as a side effect.

**No client-side test runner.** The map never asked for one, and what's left to test there is
Query, react-hook-form and the router. It gets added the first time a rendering bug survives review.

### Invites are a CLI command

`bun run invite [email]` prints a signup URL — the first invite and every one after. This is why
ticket 04's `invite.createdByUserId` is nullable: CLI-issued invites have no creator, including
yours, and you are at a terminal when the box gets set up.

The trigger for an `/invites` page is wanting to invite someone while away from a laptop. It's a
route and a form over the same function, so it's additive.

