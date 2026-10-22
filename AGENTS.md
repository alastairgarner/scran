# scran

## Before claiming work is done

Run `bun run check` — oxlint + oxfmt across the repo, then `tsc --noEmit` in both
workspaces. `bun run fix` applies the safe fixes.

A `pre-commit` hook in `.githooks/` runs the same checks over staged files and blocks the commit
if they fail. `bun install` wires it up.

## Workflow

Issues and specs live as Markdown under `tasks/<feature>/`. See `docs/agents/issue-tracker.md`.

For parallel work, UI previews, and deployment after merging, follow
[docs/development-workflow.md](docs/development-workflow.md). Use `bun run preview:up`
for an isolated seeded UI; deploy merged `origin/main` with `bun run deploy`.
Develop and test in parallel, but coordinate one agent at a time to merge locally,
validate the combined result, push main, and deploy.

## Agent skills

### Issue tracker

Issues and specs live as markdown under `tasks/<feature>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
