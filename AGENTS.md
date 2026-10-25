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

After validation, run `bun run preview:reset` from your own worktree to remove
its preview container and test database, including when work fails or is abandoned.
Keep a preview only if the user explicitly requests it for review; report its URL
and cleanup command. Never clean up another agent's previews.

## UI direction

Shared components and usage: [docs/ui.md](docs/ui.md). Live examples: `/ui`
(requires sign-in).

A warm, contemporary household cookbook: editorial content, quiet utility controls.

- Recipe titles and reading content use serif typography. Navigation, buttons,
  form controls and metadata use sans-serif.
- Prioritise finding, reading and cooking recipes; editing and household feedback
  support those tasks rather than competing with them.
- Prefer flat surfaces, clear hierarchy and purposeful whitespace. Add borders
  and containers only when they clarify grouping; avoid nested cards.
- Use moderately rounded controls; reserve pills mainly for tags and filters.
  Reserve strong accent fills for primary actions; selection is a separate role.
- Keep common tasks compact and obvious. Reveal optional structure and advanced
  metadata when needed rather than exposing the storage model by default.
- Reuse shared UI components and established screen patterns. When a recurring
  pattern is missing, add the smallest reusable pattern rather than inventing
  another feature-local style. Keep recipe-specific behaviour in feature code.
- Validate UI changes in the seeded preview at phone and desktop widths, including
  long content and relevant loading, empty and error states.

## Agent skills

### Issue tracker

Issues and specs live as markdown under `tasks/<feature>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
