# scran

A self-hosted family recipe catalogue. Photograph a cookbook page or paste a URL; a model turns it
into a recipe the household can read, rate and correct.

## Running it

```sh
bun install
cp .env.template .env
# Fill in OPENAI_API_KEY and AUTH_SECRET, then:
bun run dev
```

- client: http://localhost:5173 (Vite, proxies `/api` to the server)
- server: http://localhost:3000 (Hono on Bun)

## First sign-in

Accounts are invite-only. With the app running:

```sh
bun run invite you@example.com
```

Send the printed URL privately; it is a single-use bearer credential, not email
verification. Create the account with a 12+ character password, then use its email
and password on later sign-ins. Everyone joins the **same shared household**.
The Account screen provides password changes and device sign-out.

For invite cancellation, account disabling, recovery, limits and public VPS
requirements, read [the security guide](docs/security.md).

From the catalogue, use **+** to photograph a page or import a recipe URL. The new row appears
immediately while extraction runs.

After choosing a photo, check the preview and rotate it until the text is upright,
then select **Extract recipe**. The original photo is kept unchanged; extraction
and retries use a copy with camera orientation and your selected rotation applied.

## Parallel development

See [the development workflow](docs/development-workflow.md) for isolated worktree
previews, seeded test accounts, validation, and automatic deployment on pushes to main.

## Layout

- `server/` — Hono API
- `client/` — Vite + React
- `tasks/` — issues and specs

## Production deployment

Production is https://recipes.alastair.sh on Hostinger. **Push `main` to GitHub
to deploy**: `.github/workflows/hostinger.yaml` validates every push, but skips
image publishing/deployment for changes confined to known non-deployment paths
(such as docs/tasks). Mixed or unknown paths deploy normally. See the development
workflow for the exact policy. Verify that commit's **Verify and deploy to Hostinger**
workflow succeeds; no local deployment command is needed.

See [the Hostinger deployment guide](docs/hostinger.md) for configuration,
operator commands, backups and recovery. The [manual VPS guide](docs/vps.md)
describes an alternative installation, not the current deployment process.

## Local validation

Use `bun run preview:up` in your worktree for an isolated seeded Docker preview,
then `bun run preview:reset` after validation. See the development workflow above.

The home-server instance at `scran.hp.affablegecko.net` is retired; its container,
local data and backups have been removed, along with the obsolete local deploy
command/script. The root `compose.yaml` and `deploy/install-caddy.sh` remain
historical tooling only; do not use them for normal validation or deployment.
