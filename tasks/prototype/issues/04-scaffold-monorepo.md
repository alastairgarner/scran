# Scaffold the monorepo

Type: task
Status: open

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
