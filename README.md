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

## Capturing a recipe

Open the client and tap **Photograph a recipe**, or:

```sh
curl -F photo=@page.jpg http://localhost:3000/api/extract
```

Saves the photo under `data/photos/`, stores the model's JSON verbatim in `data/scran.db`, and
returns it plus token usage. Errors come back raw (message + stack) on purpose.

- `GET /api/recipes` — the catalogue
- `GET /api/recipes/:id` — one recipe, `data` being the model's JSON

## Layout

- `server/` — Hono API
- `client/` — Vite + React
- `tasks/` — issues and specs
