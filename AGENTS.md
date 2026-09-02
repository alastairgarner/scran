# scran

## Before claiming work is done

Run `bun run check` — Biome (lint + format) across the repo, then `tsc --noEmit` in both
workspaces. `bun run fix` applies the safe fixes.

A `pre-commit` hook in `.githooks/` runs the same checks over staged files and blocks the commit
if they fail. `bun install` wires it up.

## Workflow

Issues and specs live as Markdown under `tasks/<feature>/`. See `docs/agents/issue-tracker.md`.

## Agent skills

### Issue tracker

Issues and specs live as markdown under `tasks/<feature>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
