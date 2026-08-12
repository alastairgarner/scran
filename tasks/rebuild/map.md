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
- [What does scran look like?](issues/06-look-and-feel.md) — **an app, and a tool rather than a
  document**, settled by building nine variants and cutting eight. Recipe screen: **method owns the
  screen, ingredients in a bottom sheet** whose own lip opens it; step numbers sit *above* their
  paragraph as a rule. Swipe panes were rejected — they collide with the OS back gesture on both
  platforms. Catalogue: **name-first list, no thumbnails** (every photo is a photo of text), one
  aggregate mark, thumb-anchored search + **filter & sort sheet**, `+` FAB, and **no tab bar** —
  scran has one destination. Scaling: **stepper where the yield parsed, multipliers where it
  didn't**, at **significant figures — never snapping**, because snapping lines independently
  drifts the ratios. Ratings: a **collapsed modal mark, ties rounding down**, scoped Everyone /
  Our house / Me — which **overrides ticket 04 on both counts** (a veto can now hide, and
  "our house" needs a schema). Tags came back into scope. **Ticket 03's swap test passes**: two
  skins plus dark, one file. Spawned tickets 18–21.

- [Build the server foundation](issues/11-server-foundation.md) — **done, and marked so
  retrospectively**; the `Scaffold backend` commit left the ticket open by oversight. `config.ts`,
  `db.ts`, `errors.ts`, `logger.ts`, `storage.ts`, `index.ts` with `/api/health` behind one
  `onError`, tests on the four testable modules, `001-init.sql` carrying ticket 04's six tables and
  ticket 02's FTS table and both triggers, `shared` in the workspaces array. **Bun 1.1.42 →
  1.3.14.** Everything after this is now unblocked by it, including ticket 12.
- [Do households exist, and what are they for?](issues/20-households.md) — **a household is a saved
  selection, not an entity**: a per-user list of people you've pointed at, with no shared object and
  no agreement. Settled by the scale — six users, three couples — which makes the list **exactly one
  person**, and nobody needs to agree about a set of size one. One join table, `householdMember`,
  making seven beside Better Auth's four. Populated **through the settings UI only**; invite seeding
  was dropped, so tickets 01 and 12 are unamended and **ticket 12 no longer depends on this**.
  Asymmetry is fine, an empty list **hides** the `Our house` scope, and the blast radius is the
  rating-scope `WHERE` **and nothing else** — so the amendment to ticket 04 is narrower than
  expected: the `rating` table doesn't change. Gave scran its **second surface** (a gear-icon drawer)
  and its **first sign out**, which ticket 06 never provided. Spawned ticket 22.
- [Model tags, and get the model to assign them](issues/19-tags.md) — **ten tags, two axes,
  hard-coded in `shared/`**, assigned by the model from an `enum` it can't escape, on an eighth
  table `recipeTag` keyed to **`recipe` not `recipeVersion`** — a deliberate break from ticket 04,
  because a tag labels the dish rather than reproducing the page, and correcting one must not cost a
  version. **Speed stopped being a tag**: the real data has no time to derive from — six of nine
  rows carry none, and the one that does is wrong — so the model now supplies `totalMinutes` **and
  says whether it read it or judged it**, which is the prompt's one carve-out from *invent nothing*.
  Bands are a UI constant over that number, which also fixes ticket 06's **sort by quickest**. Tags
  are **indexed with synonyms** (*veggie* finds `vegetarian`), amending ticket 02's trigger and
  costing a second one. Correction lives in **the editor**, on the human's call that one screen owns
  changing a recipe. Split with **no new ticket**: schema and assignment to 13 (merged with ticket
  10's prompt change), chips to 21, editing to 18 — and ticket 10's sanctioned re-extraction **is**
  the backfill.
- [Build auth, invites and the invite command](issues/12-auth-and-invites-build.md) — **built**:
  Better Auth 1.6.26, `bun run invite [email]`, and the GET-renders / POST-redeems split, proven
  against a real server across a restart. Three calls the ticket left open. Better Auth's four
  tables are created by **its own migrator at boot** (`getMigrations`) rather than by its CLI — the
  vendor island survives, and an empty database (`:memory:`, or ticket 16's first container start)
  ends up complete without a manual step. Public sign-up is closed **at the Hono layer**, since
  `disableSignUp` would also block the server-side call redemption makes. And **`AUTH_SECRET` joins
  `config.ts`** — ticket 11's variable list predates this decision. Writing the CSRF test found a
  real bug in ticket 07's boundary: `HTTPException` became a 500, so a deliberate 403 both lied and
  paged; fixed. `signUpSchema` is the first thing in `shared/`, and `testing.ts` now exports the
  real-invite session fixture every later test file uses.

- [Give ingredients machine-readable quantities](issues/10-machine-readable-quantities.md) — **the
  work is all in the field descriptions**, and two things got ruled out rather than built. **The unit
  is a free-form string the code never reads** — nothing converts between units, so `1 thumb` × 2 is
  `2 thumb` and a closed unit vocabulary buys nothing. That kills **rounding** too, since unit-aware
  rounding needs a vocabulary to key on: significant figures are the answer, not an interim, which
  **overrides ticket 06's amendment**. A line is unscalable **iff `quantity` is null** — the model
  decides while looking at the page, so ticket 06's `\bor\b` heuristic is deleted rather than fixed.
  Ticket 19's tags, `total_minutes` and `time_estimated` landed in the same edit; `TAGS` and
  `normaliseTags` are now in `shared/`. Evidence: 47 of 50 real ingredient lines scalable, the other
  3 correctly not, **no false positives**, fractions clean. Iterating found three prompt bugs,
  including one **this ticket caused** — the judge-a-duration carve-out leaked into verbatim
  `totalTime` and had to be fenced. Four recorded responses are checked in for ticket 13. Decoding
  was then tested rather than assumed: **`temperature: 0` adopted**, image-before-text **rejected as
  worse**. Temperature 0 froze every *derived* field while verbatim text kept moving — which proves
  the one unstable photo is a **perception** failure, so it is [ticket 15](issues/15-capture-orientation.md)'s
  and no prompt can fix it.

- [Build the recipes module and the extraction pipeline](issues/13-recipes-and-extraction-build.md)
  — **built, and the schema question answered in zod's favour**: `z.toJSONSchema` keeps every field
  description under OpenAI strict mode, verified against the live API, so ticket 05's hand-written
  fallback dies and the contract is defined **once**. Two schemas in `shared/` — the model contract
  (snake_case, Mealie's names) and the stored shape — with one mapper between them. Ticket 19's tags
  cost a **ninth table**: `tagSearch`, a boot-synced projection of the `TAGS` constant, because a
  trigger cannot read a TypeScript array and the alternative would silently strand already-tagged
  recipes when a synonym changes. Three real bugs found while building: **retry could start a second
  concurrent extraction**, the stale sweep keyed on `createdAt` so a retried recipe was stale
  instantly, and unchained route registration would have handed ticket 21 an RPC client with **no
  endpoints**. Search now ranks by **bm25** where there's a query. `PUT /tags` was built and removed
  — it is ticket 18's. **Unblocks 14, 15, 16, 17 and 21.**

## Not yet specified

<!--
  Ticket 06 cleared this section almost entirely: the hand-edit surface graduated to ticket 18,
  the client build to ticket 21, and scaling, search and the rating/comment UI were all simply
  answered by it. Ticket 19 then answered both tag items outright — the sequencing call is made
  (schema with 13, chips with 21, editing with 18) and backfill turned out to be free, since ticket
  10's sanctioned re-extraction produces tags. One patch left, and it needs a real catalogue first.
-->

- **What the catalogue feels like at fifty recipes.** Everything was judged against five. Density,
  whether sort-by-recent stays the right default, and whether the filter sheet is reached often
  enough to deserve its button are all open — and unanswerable until there's a real catalogue,
  which means after ticket 17's migration.

## Out of scope

**Two maps take what this one rules out.** [Post-launch enhancements](../enhancements/map.md) — a
parked, uncharted standing map — now holds every *feature* below (eval harness, shopping lists,
meal planning) plus meal photos and semantic search, on the grounds that being out of *this* scope
isn't the same as being worthless. The public deploy is still its own future map. Ruling something
out here means picking which of the two it lands on.

- **VPS, domain, TLS to the public internet, offsite backups.** The destination stops at the home
  server. A public deploy is a fresh effort.
- **Object storage for sources (S3, MinIO).** Settled during charting and re-stated here after
  ticket 05: sources live on **local disk**, under `DATA_DIR`, bind-mounted into the container.
  Object storage buys durability across machines and there is one machine. `storage.ts` is the
  insurance — it monopolises paths, so if a public deploy ever wants a bucket, that's one module.
  Backing up the `DATA_DIR` directory and the SQLite file belongs to [ticket 16](issues/16-docker.md).
- ~~**Tags.**~~ **Back in scope**, as [ticket 19](issues/19-tags.md). Cut during charting on the
  grounds that search answers the question people actually ask; ticket 06 showed it doesn't. FTS5
  matches words that are *on the page*, so every categorical question — quick, veggie, midweek —
  is invisible to it. Returns as a **closed vocabulary the model picks from**, because free-form
  tags drift — now settled at ten, on diet and course only.
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
