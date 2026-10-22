# Parallel development and deployment

Each agent works on its own branch in its own Git worktree. Each worktree gets
an isolated Docker preview with synthetic data. After merging, an agent explicitly
deploys `origin/main` to the shared instance at https://scran.hp.affablegecko.net.
There is no polling, webhook, or automatic deployment.

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

Run `preview:reset` before deleting a worktree to avoid orphaned Docker volumes.
The commands lock per worktree, so two agents cannot rebuild the same preview
simultaneously. Different worktrees can build and run concurrently.

Extraction uses a dummy API key by default and will fail if exercised. For live
extraction, supply a separate development key via `PREVIEW_OPENAI_API_KEY` in the
shell environment before `preview:up`; it is passed only to that preview container.
Seed generation never calls OpenAI. Browser checks should cover the changed flow,
not merely a successful health response.

## Check and merge

The agent runs validation locally before committing and merging. There is no
GitHub Actions workflow.

Before committing:

```sh
bun run check
bun test
```

Validate the affected flow in the Docker preview and commit the worktree branch.
Development and preview testing can run in parallel, but designate one agent at a
time to handle the entire merge, push, and deployment sequence. Other agents keep
working in their own worktrees and wait before integrating their branches.

The designated agent:

1. Fetches `origin` and brings local `main` up to date with a fast-forward.
2. Merges the committed feature branch into local `main`, resolving conflicts.
3. Runs `bun run check` and `bun test` on the combined result, and repeats affected
   UI validation when intervening changes could affect the feature.
4. Pushes `main` to `origin`, then runs `bun run deploy` and verifies success before
   handing integration to the next agent.

Use a clean checkout for merging; do not switch the primary checkout while it
contains another agent's uncommitted work. If a merge or check fails, resolve it
before pushing. If the remote rejects the push because main advanced, fetch and
integrate those changes, then rerun validation; never force-push main.

Merging is local Git work; GitHub CLI and pull requests are not required. The
one-agent-at-a-time rule is coordinated manually. The deployment lock protects
container replacement, not Git merges or pushes.

Database migrations must have unique filenames and should remain compatible with
the previous app version where possible.

## Deploy merged changes

After a successful merge, from any worktree on this host:

```sh
bun run deploy --prepare  # Optional: check and build without replacing anything
bun run deploy
```

The deployment command:

1. Takes one shared deployment lock across all worktrees; exits if already held.
2. Fetches `origin/main` into a dedicated clone under the primary checkout's
   `.scratch/deployment/checkout` and checks out its exact commit.
3. Installs locked dependencies, runs `bun run check` and `bun test`, then builds
   a Docker image tagged `scran-deploy:<commit SHA>`.
4. Stops the shared container and backs up the entire primary checkout's `data`
   directory under `backups/`. If the backup fails, it restarts the old container.
5. Replaces the shared container, waits for health, and prints the deployed SHA.

Keep the primary checkout in place: its `.env`, `data`, `backups`, and deployment
state are shared infrastructure, independent of agent worktrees. Only its `.env`
is used for deployment secrets. The existing Compose project name `scran`, port
`3080`, Caddy route, and household data directory are preserved. No agent branch
or uncommitted change is deployed. Deploying requires Git access to the remote.
Each invocation deploys the main commit it fetched; a later merge needs another
invocation.

The first deployment of this tooling requires these files to be merged into
`origin/main`. `--prepare` does all checks and the image build but never stops or
replaces the shared container or changes its data.

There is brief downtime during backup and replacement. Startup applies database
migrations automatically. On failure after replacement begins, inspect logs and
migrations before rolling back: an old image may not understand the new schema.
The prior image ID is recorded in `.scratch/deployment/previous-image`, the last
successful SHA in `.scratch/deployment/deployed-sha`, and each pre-deploy data
backup includes its target SHA. Keep the failed data directory before restoring a
backup with the service stopped, using the restore procedure in the README.
Backups and old images are retained; remove obsolete ones deliberately. These
local backups do not replace off-machine backups.
