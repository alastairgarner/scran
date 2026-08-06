# scran

Photograph a cookbook page, get a structured recipe back, browse it. Local-only prototype.

## Running it

```sh
bun install
cp .env.template .env   # then fill in OPENAI_API_KEY
bun dev
```

- client: http://localhost:5173 (Vite, proxies `/api` to the server)
- server: http://localhost:3000 (Hono on Bun)

## Layout

- `server/` — Hono API
- `client/` — Vite + React
- `tasks/` — issues and specs
