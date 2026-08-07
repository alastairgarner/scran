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

**Rewrite in place.** Same repo, same git history, same `data/`. What survives verbatim:
`server/src/prompts/`, the response schema in `extract.ts`, the photos on disk. Everything else
is up for replacement.

**Settled during charting** (don't relitigate without a good reason):

- **Stack survives**: Bun, Hono, Vite + React, SQLite. Add a router and a data layer client-side;
  keep the API boundary. No full-stack framework — SSR buys nothing behind a login.
- **One shared catalogue.** Everyone sees every recipe. Per-user: **ratings** (individual, with a
  surfaced cross-user average) and **notes** (shared, but authored — attributed to a person).
- **Invite-only, single-use invite links.** No email sending, no OAuth, no passwords. You generate
  a link, paste it into any chat. The invite list is the set of unredeemed tokens. Sessions roll on
  use so a device never silently logs out; a lost device means you issue another link.
- **Full recipe versioning.** The model's original extraction is never destroyed by a human edit.
  Append-only versions; **no history UI** until someone actually wrecks a recipe.
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
- [Set up linting, formatting and typechecking](issues/08-lint-and-tooling.md) — Biome 2.5.7, one
  binary for lint + format + import sorting; `bun run check` also typechecks both workspaces.
  Configured to **match `~/forte/sn-web`'s house style** — 80 cols, single quotes, `type` over
  `interface`, no default exports on the server. A `PostToolUse` hook and VS Code format-on-save
  keep it applied. Typecheck is clean; the remaining lint findings are all in code the rewrite
  replaces. Bun is on 1.1.42 and wants upgrading before the rewrite.

## Not yet specified

- **Hand-edit surface.** In scope, and the reason versioning exists — but what it *is* (edit the
  fields? edit the JSON? photo beside the form?) waits on the data model and the design tokens.
- **Capture orientation fix.** In scope. The prototype's worst result by a distance was a page
  shot 90° rotated. Rotate before upload, or honour EXIF, or ask the model — cheap either way,
  but it's a build ticket that waits on the extraction module's new shape.
- **URL import build.** Decided in principle (raw HTML, own prompt). The pipeline itself —
  fetching, JSON-LD, what a URL-sourced recipe looks like in a photo-shaped UI — waits on the
  data model.
- **Search build.** The mechanism is settled (FTS5). What search *looks like* — the box, the
  results, whether snippets are shown — waits on the data model and the design tokens.
- **Where photos live.** Settled for this effort: local disk on the box, bind-mounted into the
  container. Object storage (S3, MinIO) is a public-deploy concern, not a LAN one. The insurance
  that keeps it cheap belongs to ticket 05 — **one module owns photo paths**, so nothing else
  knows where bytes are. Backups of the photo directory and the SQLite file are also fog.
- **Docker.** The destination requires a `Dockerfile` and a compose file that run on the home
  server. **No Caddy** — see the Notes: there's no domain on the LAN, so there's nothing to
  terminate TLS for.
- **Migrating the 7 existing recipes** into whatever schema the data model ticket lands on.
- **Env-driven cookie and URL config.** The one piece of the TLS story that *is* in scope: `Secure`
  off on the LAN, on in public, as a config value rather than a code change. Belongs to ticket 05.
- **Rating and note UI.** Trivial once the data model is settled; not before.

## Out of scope

- **VPS, domain, TLS to the public internet, offsite backups.** The destination stops at the home
  server. A public deploy is a fresh effort.
- **Tags.** Considered and cut during charting — search over name and ingredients answers the
  question people actually ask. Returns if search proves it needs them.
- **Shopping lists and scaling.** Ruled out flatly.
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
