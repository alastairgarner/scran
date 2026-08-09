# Map: Rebuild scran properly

## Destination

The same app, **rebuilt properly and multi-user**, running in Docker on a home server and used
for real. Built properly means: accounts, logging, error handling, linting, tests, a design
system on Tailwind. Multi-user means: one shared catalogue, per-user ratings, authored notes,
invite-only accounts. Done when someone who isn't me signs in on their own phone, captures a
recipe, fixes what the model got wrong, and rates it — against a container I did not start by hand.

Deployment beyond "runs in Docker on my own box" is **not** here: no VPS, no domain, no offsite
backups.

## Notes

**Domain**: self-hosted family recipe catalogue. Predecessor map:
[Recipe capture prototype](../prototype/map.md) — read its Decisions-so-far before relitigating
anything about the stack, the schema, or the extraction pipeline.

**This map carries execution**, like the prototype map. The destination is a running artifact, so
`task` tickets build things. Unlike the prototype map, the quality bar is **not** low — that is
the entire point of this effort.

**Rewrite in place.** Same repo, same git history, same `data/`. The photos on disk survive
untouched — they are the irreplaceable artifact. `server/src/prompts/` and the response schema in
`extract.ts` survive as a *base*, not verbatim: ticket 04 restored scaling to scope, so both gain
machine-readable quantities in [ticket 10](issues/10-machine-readable-quantities.md). Everything
else is up for replacement.

**The domain vocabulary lives in [CONTEXT.md](../../CONTEXT.md)** — source, extraction, version,
edit, ingredient line, comment versus note, and the household's cross / tick / double tick rating
scale. Read it before naming anything.

**Settled during charting** (don't relitigate without a good reason):

- **Stack survives**: Bun, Hono, Vite + React, SQLite. Add a router and a data layer client-side;
  keep the API boundary. No full-stack framework — SSR buys nothing behind a login.
- **One shared catalogue.** Everyone sees every recipe. Per-user: **ratings** (individual;
  ticket 04 replaced the cross-user *average* with the **spread**, because averaging a cross away
  destroys the one thing the scale is for) and **comments** (shared, but authored — attributed to a
  person; *comment*, not note, since `notes` is the page's own).
- **Invite-only, single-use invite links.** No email sending, no OAuth, no passwords. You generate
  a link, paste it into any chat. The invite list is the set of unredeemed tokens. Sessions roll on
  use so a device never silently logs out; a lost device means you issue another link.
- **Full recipe versioning.** The model's original extraction is never destroyed by a human edit.
  Append-only versions; **no history UI** until someone actually wrecks a recipe. Ticket 04 settled
  the rest: current is the highest version, and **re-extraction does not exist** — once a recipe
  has content, corrections are edits. Only *retry* of a failed first extraction survives.
- **URL import keeps the same invariant** as photos: store the **raw HTML** permanently, so
  re-extraction stays cheap and every downstream decision stays reversible. Its own prompt.
- **Testing**: unit tests on pure logic, integration tests against a **recorded** LLM response —
  `bun test` stays fast, free and deterministic. No live calls in the suite. That fixture is most
  of an eval harness when one graduates back in.
- **Design tokens hand-rolled** on Tailwind, not an off-the-shelf component library. This is a
  learning exercise, and the goal is restyling the whole app from a few config values.
- **On the LAN there is no domain — just an IP.** `recipes.alastair.sh` is the *deploy* hostname
  (`alastair.sh` is on Cloudflare), and it arrives with the public deploy, not here. Consequences
  for this map: **no TLS, no Caddy, no passkeys** — WebAuthn forbids bare IPs outright. Plain
  `http://192.168.x.x` serves cookies fine; it only forbids the `Secure` flag. So **the cookie
  config must be env-driven**, and flipping it on is one variable at deploy time. Email + password
  is the credential for this entire map.
- **The box is LAN-only or Tailscale-only** for this effort. Nothing scran runs is reachable from
  the public internet, which empties most of the threat model — the invite-link hardening in
  ticket 01 is mostly *next* phase's concern (public domain), gathered now so the auth choice
  doesn't foreclose it. Build it right, but don't let it gate anything.
- **Logging and errors**: a *pattern*, not a product — a logger and an error-class boundary. No
  Sentry, no persisted error log. `docker logs` is the aggregator at five users.

**Skills**: `/mp-grilling` + `/mp-domain-modeling` for the data model and architecture tickets.
`/mp-prototype` for look-and-feel and the edit surface. `/mp-research` for the research tickets.

## Decisions so far

<!-- one line per closed ticket -->

- [Invite-only accounts and rolling sessions on Bun + Hono](issues/01-auth-and-sessions.md) —
  **invitation-based registration on Better Auth, with passkeys as a second credential.** Invite
  link opens a signup *form*; `GET` renders, **`POST` redeems**, so a link previewer can't burn it.
  Real accounts (email + password) that outlive any device; a passkey added per device becomes the
  daily login. Rolling sessions, **no absolute cap**, `SameSite=Lax`. Passkeys and TLS both need a
  real hostname, so both wait for the public deploy — **this map is email + password only**, with
  the `Secure` cookie flag as config.
- [Swappable design token system on Tailwind](issues/03-design-token-system.md) — **Tailwind v4**,
  one `theme.css`: primitives in `@theme`, semantics in `:root`, registered via **`@theme inline`**
  (plain `@theme` silently breaks dark mode). `--color-*: initial` makes naming a raw colour
  physically impossible. Four hand-written components, native `<dialog>`, no library. Vite 6 and
  React 18 stay as they are. Re-skin is one file; what it can't change is component *shape*.
- [FTS5, vectors, or both](issues/02-search-approach.md) — **FTS5, nothing else.** Verified by
  running it: FTS5 is compiled in on macOS *and* in `oven/bun:1-slim`. Kept in sync by one trigger
  on `recipe_versions`, so no code can forget to reindex. `sqlite-vec` rejected — it can't load on
  macOS at all, and has no ANN index anyway. Semantic search is an additive upgrade, not a fork.
- [Settle the error and logging pattern](issues/07-errors-and-logging.md) — lift sn-web's
  `AppError`/`ClientError` split (fault decides the class, factories own the status), minus Sentry;
  `severity` becomes log level. Failed extraction is `AppError.dependency`. 5xx returns a generic
  message plus a greppable error id, never a stack. Photo saved and the row created **`pending`**
  before the LLM call, so a failure is retryable from disk — **an input to ticket 04.** pino to
  stdout, request id on every line.
- [Lock the multi-user, versioned data model](issues/04-data-model.md) — **six tables beside Better
  Auth's four**; versions append-only with **current = highest**, so no pointer and ticket 02's
  trigger stands. Scalars lifted to columns, the three *lists* stay JSON — normalising them would
  copy ~16 child rows per typo fix and buy nothing FTS doesn't already do. Extraction metadata are
  columns on the version, so **`model IS NULL` means a person wrote it**; `createdByUserId` is
  always set, because attribution and authorship are different facts. Sources are 0..N artifacts
  (`photo|html`) — typed-in is *no* source row. Ratings per recipe on the household's **cross /
  tick / double tick** scale, surfaced as a **spread, never a mean** (an average erases a veto).
  Nothing hard-deleted; anyone edits, creator-only deletes. **Reversed two upstream calls**:
  re-extraction is gone, and scaling is back in, so ingredients gain machine-readable quantities.
- [Set up linting, formatting and typechecking](issues/08-lint-and-tooling.md) — Biome 2.5.7, one
  binary for lint + format + import sorting; `bun run check` also typechecks both workspaces.
  Configured to **match `~/forte/sn-web`'s house style** — 80 cols, single quotes, `type` over
  `interface`, no default exports on the server. A `PostToolUse` hook and VS Code format-on-save
  keep it applied. Typecheck is clean; the remaining lint findings are all in code the rewrite
  replaces. Bun is on 1.1.42 and wants upgrading before the rewrite.
- [What shape does the rewritten codebase take](issues/05-architecture.md) — **three workspaces,
  raw SQL, zod as the only schema language, and one deep `recipes.ts` holding every versioning
  invariant.** `config.ts` parses env at boot and throws; nothing else reads `process.env`, which is
  where `COOKIE_SECURE` and `DATA_DIR` land. `storage.ts` monopolises photo paths. Photo and URL
  meet at `extract(source)` — two prompts, one schema, one write path. **Capture is asynchronous**:
  202 + poll, plus a stale-pending sweep at boot. `shared/` holds the zod schemas, Hono RPC types
  the calls. Three client state owners — Query, the URL, react-hook-form — and **no store**, because
  a global store is usually a hand-rolled server cache. The LLM seam is a defaulted parameter, so
  the recorded fixture needs no framework. Invites are a `bun run invite` command. **This ticket
  turned the map from decisions to build**: 11–17 are its tickets.

## Not yet specified

- **Hand-edit surface.** In scope, and the reason versioning exists. The data model no longer
  blocks it — an edit appends a version, anyone may edit, `text` on an ingredient line is
  sacred — so what's left is purely *what it looks like*, and that waits on ticket 06.
- **Scaling.** Restored to scope by ticket 04; ticket 10 produces the quantities it needs. What
  remains is the UI: a servings stepper where `yield_quantity` parsed, raw multiplier buttons
  where it didn't, and a clear mark on every line that **can't** be scaled. A render-time
  multiply over stored data — nothing more is persisted.
- **Search build.** The mechanism is settled (FTS5) and the server side is ticket 13's `?q=`. What
  search *looks like* — the box, the results, whether snippets are shown — waits only on ticket 06
  now.
- **The client build itself.** Ticket 05 fixed the structure (routes, `api/` hooks, `RequireAuth`,
  three state owners) but not a single screen. The other UI entries here are slices of it, and all
  of them wait on ticket 06 — so how they're cut stays fog until there's something to look at.
- **Rating and comment UI.** Semantics settled by ticket 04 — three-point cross / tick / double
  tick, one per person, and the **spread** shown rather than an average. What's left is drawing it,
  which waits on ticket 06. (It is *comment*, not note: `notes` is the page's own.)

## Out of scope

- **VPS, domain, TLS to the public internet, offsite backups.** The destination stops at the home
  server. A public deploy is a fresh effort.
- **Object storage for sources (S3, MinIO).** Settled during charting and re-stated here after
  ticket 05: sources live on **local disk**, under `DATA_DIR`, bind-mounted into the container.
  Object storage buys durability across machines and there is one machine. `storage.ts` is the
  insurance — it monopolises paths, so if a public deploy ever wants a bucket, that's one module.
  Backing up the `DATA_DIR` directory and the SQLite file belongs to [ticket 16](issues/16-docker.md).
- **Tags.** Considered and cut during charting — search over name and ingredients answers the
  question people actually ask. Returns if search proves it needs them.
- **Shopping lists.** Ruled out flatly. (**Scaling was wrongly listed here** — the prototype map
  *deferred* it, saying whichever of the two got built first is what forces ingredients to be
  structured. Ticket 04 restored it to scope; it now lives in **Not yet specified**.)
- **[An eval harness for extraction quality](../prototype/issues/08-eval-harness.md).** Carried
  from the prototype map and ruled out again: this effort's testing story is recorded-response
  fixtures. The gap is real — nothing here tells you a prompt change made extraction worse — and
  the fixtures are most of the harness when it graduates.
- **[Hostname, TLS and a certificate](issues/09-lan-tls-certificate.md).** On the LAN there is no
  domain, so there is no certificate to get and no passkey to enrol. Carried to the public-deploy
  map with its hostname decision intact.
- **Passkey enrolment.** WebAuthn forbids bare IP hostnames outright, so passkeys are impossible
  until `recipes.alastair.sh` is serving. Deferred to the public-deploy map — where, because the
  hostname was chosen deliberately, they'll enrol once and survive.
- **Meal planning, calendars, scanner hardware.** Inherited from the prototype map, unchanged.
