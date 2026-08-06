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

## Extracting a recipe

```sh
curl -F photo=@page.jpg http://localhost:3000/api/extract
```

Saves the photo under `data/photos/` and returns the model's JSON verbatim, plus token usage.
Errors come back raw (message + stack) on purpose.

## Layout

- `server/` — Hono API
- `client/` — Vite + React
- `tasks/` — issues and specs
