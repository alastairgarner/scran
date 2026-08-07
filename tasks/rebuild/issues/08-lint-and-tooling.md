# Set up linting, formatting and typechecking

Type: task
Status: resolved

## Question

Nothing to decide at length — "linting" is on the built-properly list and the repo has none. Pick
one toolchain, wire it up, make it runnable from the root of the workspace.

- Linter + formatter (Biome is one tool and one config for both; ESLint + Prettier is the older,
  heavier, more configurable pair)
- `tsc --noEmit` across both workspaces, since neither Vite nor Bun typechecks on run
- One root script that runs all of it, and a note in `AGENTS.md` so agents run it before claiming
  work is done

No CI — there's no CI in this effort, and adding a pipeline for a repo that only ever builds on
one laptop is not the point. This ticket is done when `bun run check` passes on the existing code
or reports honest failures in it.

## Answer

**Biome 2.5.7**, pinned exact, as the single devDependency at the workspace root, configured to
**match the house style of `~/forte/sn-web`** — the codebase this project's author reads every
day. Familiarity is the justification; a style nobody recognises is a tax on every review.

`biome.json` uses `.gitignore` as its ignore file and enables import sorting. Formatting: 2-space
indent, **80 columns**, **single quotes**, trailing commas everywhere, `asNeeded` arrow parens
(double quotes retained in CSS). Lint rules chosen because they shape how code *reads*: `type`
over `interface`, `T[]` array syntax, `import type` / `export type`, block statements always,
collapsed `else if`, no negated `else`, no `console` (pino replaces it), no shadowing,
`throw new Error` only. `noDefaultExport` is **on for the server and off for `client/**`** —
right for a Hono API, against the grain in React — with further exemptions for `server/src/index.ts`
(Bun's entry point requires a default export) and `*.config.ts`. `useSortedClasses` is enabled
ready for Tailwind.

**Not adopted from sn-web**: their `sn/*` custom plugin (needs their shim), the Jest rules (scran
uses `bun:test`), and explicit-return-types-on-exports — Biome's equivalent isn't scoped to
exports, so it would be noise rather than signal. That last one is a genuine gap against their
setup.

**Editor loop**, so style is never a thing anyone thinks about:

- A `PostToolUse` hook on `Write|Edit` in `.claude/settings.json` runs `biome check --write` on
  each file an agent touches. Verified firing by introducing a bad indent and watching it get
  corrected.
- `.vscode/settings.json` sets Biome as the default formatter with format-on-save, plus organise-
  imports and quick-fix on save. `.vscode/extensions.json` recommends `biomejs.biome` (**needs
  installing** — sn-web uses `oxc.oxc-vscode`, which won't drive Biome), the Tailwind extension
  ahead of ticket 03's work, and the Bun extension.

Scripts on the root `package.json`:

- `bun run check` — `biome check .` then `tsc --noEmit` in both workspaces
- `bun run fix` — `biome check --write .`

`AGENTS.md` now tells agents to run `bun run check` before claiming work is done.

**Why Biome over the alternatives.** Bun ships neither a linter nor a formatter (`bun fmt` and
`bun lint` do not exist), so something external was always needed. ESLint + Prettier is two tools,
two configs and a plugin ecosystem to maintain. `oxlint` (1.77.0) is faster and carries more
rules — much of the ESLint ecosystem ported — but it is a linter only; its formatter `oxfmt` is
still pre-1.0 (0.62.0), so it means a second tool anyway. One binary, one config, at this size.
Swapping to oxlint + Prettier later is a swap, not a migration.

**State of the existing code**: `tsc --noEmit` passes clean in both workspaces. Formatting has
been applied across the repo (5 files changed, no behaviour). 12 lint findings remain, **left
unfixed on purpose** — all of them are in code the rewrite replaces, and silencing rules to make
a doomed file pass would be the wrong trade:

- `client/src/main.tsx` — 5× `noArrayIndexKey`, 2× `useButtonType` (a11y), 2×
  `noNonNullAssertion`, 1× `useExhaustiveDependencies`
- `server/src/extract.ts`, `server/src/extract.test.ts` — `noExplicitAny` on the parsed model
  response, which ticket 04/05 should replace with real validation of the LLM's output

**Pre-commit hook**: `.githooks/pre-commit` runs `biome check --staged` then `tsc --noEmit` across
both workspaces. **No husky and no lint-staged** — Biome reads the staged set itself (`--staged`),
which is the only job lint-staged was doing. `core.hooksPath` is wired up by a `prepare` script, so
`bun install` installs it on any clone; that's husky's trick without husky. The hook checks and
never writes: auto-fixing mid-commit would leave unstaged changes behind. Verified both ways — a
badly formatted staged file exits 1, a clean tree exits 0.

Two deliberate differences from sn-web: it **does** typecheck (theirs doesn't — they leave it to
CI; here both workspaces take about a second, and there is no CI), and it does **not** block commits
to the default branch, since this repo works on `main`.

**Not done**: no CI, as scoped out above.

**Noticed in passing**: this repo is on Bun 1.1.42, which is well behind current. Worth upgrading
before the rewrite starts, but that's not this ticket.
