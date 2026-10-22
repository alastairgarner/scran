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

Open the printed URL, create the account, then use its email and password on later sign-ins.

From the catalogue, use **+** to photograph a page or import a recipe URL. The new row appears
immediately while extraction runs.

After choosing a photo, check the preview and rotate it until the text is upright,
then select **Extract recipe**. The original photo is kept unchanged; extraction
and retries use a copy with camera orientation and your selected rotation applied.

## Parallel development

See [the development workflow](docs/development-workflow.md) for isolated worktree
previews, seeded test accounts, validation, and explicit deployment after merging.

## Layout

- `server/` — Hono API
- `client/` — Vite + React
- `tasks/` — issues and specs

## Home server

`compose.yaml` runs the built frontend and API in one container, published only
on `127.0.0.1:3080`. The host's Caddy serves
`https://scran.hp.affablegecko.net` over Tailscale. DNS must point that hostname
at `100.90.71.107` without Cloudflare proxying.

Set `OPENAI_API_KEY` and a random `AUTH_SECRET` (at least 32 characters) in `.env`,
then run:

```sh
docker compose up -d --build --wait
docker compose exec scran bun server/src/cli/invite.ts you@example.com
```

The Compose configuration sets the HTTPS origin and secure cookies. The image
does not contain `.env` or recipe data. Extraction defaults to `gpt-4.1` with
`temperature: 0`, matching the recorded extraction experiments. Any model override
must support that sampling setting. On this host, install the Caddy route once:

```sh
sudo sh deploy/install-caddy.sh
```

This validates the combined configuration, preserves a backup, and reloads the
existing Caddy service. It reuses the existing `cloudflare_tls` snippet.

Docker is enabled at boot on the home server; `restart: unless-stopped` brings
Scran back after restarts unless it was explicitly stopped. Inspect it with
`docker compose ps` and `docker compose logs --tail=100 scran`.

All persistent state lives in `./data`: `scran.db`, SQLite's WAL/SHM sidecars, and
`sources/`. Mounting the whole directory keeps them together across container
replacement. The `:Z` mount option supports this host's SELinux configuration.

For a consistent manual backup, stop writes while copying the whole directory:

```sh
mkdir -p backups
docker compose stop scran
tar -czf "backups/scran-$(date +%Y%m%d-%H%M%S).tar.gz" data
docker compose start scran
```

Keep a separate secure copy of `.env`. To restore, stop Scran, preserve the
current `data` directory, unpack the backup into the repository root, and start
Scran again. Automated and off-machine backups are not configured here.
