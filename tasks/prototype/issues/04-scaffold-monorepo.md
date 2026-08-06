# Scaffold the monorepo

Type: task
Status: resolved

## Question

Nothing to decide — the stack was settled during charting. Build the skeleton so the pipeline
ticket has somewhere to land.

- Bun workspaces, `server/` and `client/`
- `server/`: Hono, one health route, running under Bun
- `client/`: Vite + React, talking to the server in dev (proxy or Hono RPC client — pick whichever
  is less work)
- `.gitignore`, `.env.example` for the LLM API key, a README with "how do I run this"
- One command that starts both

Deliberately not here: Docker, CI, tests, linting config beyond whatever Vite ships with,
auth, deployment. Those live in the fog.

Done when `bun dev` gives a page in the browser that has round-tripped something through Hono.

## Answer

Built. `bun dev` at the root runs `bun run --filter '*' dev`, starting Hono on :3000 and Vite on
:5173; Vite proxies `/api` to the server. The page renders `server says: {"ok":true,...}` from
`GET /api/health`, so the round trip is real.

- `server/` — `src/index.ts`, Hono app exported as `{ port, fetch }` for `bun --watch`
- `client/` — Vite + React, `server.proxy` in `vite.config.ts` (no RPC client; the proxy is less work)
- `.env.template` from ticket 07 already records `OPENAI_API_KEY` — no separate `.env.example`
- README covers install / env / run

No Docker, CI, tests, auth or deployment, per the ticket. `typecheck` scripts (`tsc --noEmit`) in
both packages are the one addition beyond it.
