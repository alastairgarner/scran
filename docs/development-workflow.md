# Parallel development and deployment

Each agent works on its own branch in its own Git worktree. Each worktree gets
an isolated Docker preview with synthetic data. Pushing `main` to GitHub
**automatically deploys production** for deployment-relevant changes at
https://recipes.alastair.sh through the
[Hostinger workflow](hostinger.md). This is the current, configured deployment
path; worktree previews remain isolated and unchanged.

Do not publish a shared local instance for validation. The home-server deployment
at `scran.hp.affablegecko.net` is retired, and the obsolete local deploy
command/script have been removed. Do not run the root `compose.yaml` unless
explicitly asked to restore that legacy installation. Use `bun run preview:up`
for validation.

## Start work

Create/select a worktree in your agent application, or use Git directly:

```sh
git fetch origin
git worktree add ../scran-example -b feature/example origin/main
cd ../scran-example
bun install --frozen-lockfile
```

Use one agent per worktree. Coordinate changes to shared files and migration
numbers; separate worktrees do not prevent logical conflicts.

## Validate the UI

Prerequisites: Docker, Bun, Bash, curl, OpenSSL, and the Linux utilities `flock`
and `sha256sum`.

```sh
bun run preview:up
```

This builds the current worktree, including uncommitted changes, and prints a URL
such as `http://127.0.0.1:49153`. Open that exact origin in the agent's browser.
On this host T3 browser automation also needs its system libraries installed once:

```sh
sudo env "PATH=$PATH" t3 browser setup
```

If preview automation reports missing libraries, run that command before trying
browser validation again.

Sign in with:

- Email: `preview@scran.test`
- Password: `scran-preview-password`

The fixture includes three ready recipes with ingredients, instructions, tags,
ratings and comments, plus pending and failed rows. It uses the real invite/signup
flow to create the account. No household data or secrets are copied.

Docker allocates the localhost port; there is no port selection race. A short
startup gate lets the script supply that exact origin before the app starts, so
authentication and CSRF match the browser URL. These previews are not exposed on
Tailscale. A browser on another machine needs a tunnel or a browser running here.
Each preview has a distinct authentication cookie prefix, so signing into one
preview does not replace another preview's session on the same localhost hostname.

Container/image names derive from the absolute worktree path. Each preview has
its own Docker volume containing SQLite, WAL/SHM files and sources. Rebuilding
preserves that volume and existing edits; it can assign a different port. Seeds
run once per volume. A restart changes any pending recipes to failed, as in the
shared app. Recreate the volume to recover the original pending fixture.

```sh
bun run preview:url    # Find the current address
bun run preview:logs   # Diagnose startup or API failures
bun run preview:up     # Rebuild after edits; no live reload
bun run preview:down   # Remove the container, preserve data
bun run preview:reset  # Remove this preview's container AND data
```

After validation, run `bun run preview:reset` from your own worktree to remove
its container and test data, including when work fails or is abandoned. The next
`preview:up` recreates a fresh seeded database. Keep a preview only if the user
explicitly requests it for review; report its URL and the cleanup command to run
from that worktree. Never clean up another agent's previews. Always reset before
deleting a worktree to avoid orphaned Docker volumes.
The commands lock per worktree, so two agents cannot rebuild the same preview
simultaneously. Different worktrees can build and run concurrently.

Extraction uses a dummy API key by default and will fail if exercised. For live
extraction, supply a separate development key via `PREVIEW_OPENAI_API_KEY` in the
shell environment before `preview:up`; it is passed only to that preview container.
Seed generation never calls OpenAI. Browser checks should cover the changed flow,
not merely a successful health response.

## Check and merge

The agent runs validation locally before committing and merging; CI does not
replace local validation.

Before committing:

```sh
bun run check
bun test
```

Validate the affected flow in the Docker preview and commit the worktree branch.
GitHub Actions also runs these checks for pull requests and pushes to main.
The Hostinger workflow is enabled: deployment-relevant pushes to `main` can
replace production. CI checks still run for every push.
At this early stage, production breakage is an accepted development risk, not a
reason to deploy a separate shared home-server instance.

Development and preview testing can run in parallel, but designate one agent at a
time to handle the entire merge, push, and deployment sequence. Other agents keep
working in their own worktrees and wait before integrating their branches.

The designated agent:

1. Fetches `origin` and brings local `main` up to date with a fast-forward.
2. Merges the committed feature branch into local `main`, resolving conflicts.
3. Runs `bun run check` and `bun test` on the combined result, and repeats affected
   UI validation when intervening changes could affect the feature.
4. Pushes `main` to `origin`, triggering production deployment. Checks the
   **Verify and deploy to Hostinger** workflow for that commit and verifies it
   succeeds before handing integration to the next agent. Report failures; do not
   substitute a local deployment.

Use a clean checkout for merging; do not switch the primary checkout while it
contains another agent's uncommitted work. If a merge or check fails, resolve it
before pushing. If the remote rejects the push because main advanced, fetch and
integrate those changes, then rerun validation; never force-push main.

Merging is local Git work; GitHub CLI and pull requests are not required. The
one-agent-at-a-time rule is coordinated manually. GitHub Actions serializes
production deployments; that does not coordinate local Git merges or pushes.

Database migrations must have unique filenames and should remain compatible with
the previous app version where possible.

## Deployment path policy

CI verification runs on every push/PR. Publishing images and deploying production
are skipped only when **every changed path** is one of:

- `docs/**`, `tasks/**`, `.vscode/**`, `.githooks/**`;
- `AGENTS.md`, `CONTEXT.md`, `README.md`, `LICENSE`, `.env.template`;
- `scripts/preview.sh`;
- `compose.yaml`, `compose.vps.yaml`, `deploy/install-caddy.sh`,
  `deploy/scran.caddy`, `deploy/public.Caddyfile.example`.

The classifier in `scripts/deployment-required.py` checks the entire push, not
just its final commit. Renames include both old and new paths. Mixed changes,
unknown paths, unavailable history and manual deployment dispatches deploy
normally. App code/tests, dependencies, build files, production manifests,
workflow/verification scripts and check configuration are not excluded.

## Deploy merged changes

After validating and merging, push `main`:

```sh
git push origin main
gh run list --workflow hostinger.yaml --branch main --limit 5
gh run watch <run-id> --exit-status
```

Choose the run matching the pushed commit. The workflow builds immutable images,
deploys through Hostinger Docker Manager, verifies both running image digests and
container health, and checks public HTTPS `/api/health`. A push is not a confirmed
deployment until its workflow succeeds. See [the Hostinger guide](hostinger.md)
for configuration, diagnosis, backups and recovery.

There is no local deployment command or manual Docker deployment step. Local
Docker is for isolated, seeded worktree previews only. The retired home-server
container and its local data/backups have been removed; do not recreate them as
part of validation or deployment. Production data/backups live on the VPS.
