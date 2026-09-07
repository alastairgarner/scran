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

## Layout

- `server/` — Hono API
- `client/` — Vite + React
- `tasks/` — issues and specs
