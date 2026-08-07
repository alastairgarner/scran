# How is a swappable design token system built on Tailwind?

Type: research
Status: resolved

## Question

The design system is hand-rolled on Tailwind, deliberately — this is a learning exercise, and the
goal is that **restyling the whole app is a few config values**, not a find-and-replace across
components.

Find out how that's actually done in current Tailwind:

- **Tailwind's own token model.** `@theme` and CSS-variable-backed tokens in v4 versus the v3
  `tailwind.config` approach — which is current, and what does defining a custom scale look like?
- **Semantic vs primitive tokens.** How do you express `surface`, `ink`, `accent` in terms of a
  primitive palette so a component never names a colour directly? What does that look like in
  practice, and where does it break down?
- **The swap test.** Concretely: what would changing the entire app from "cookbook" to "app" —
  type scale, palette, radii, density — actually touch? If the answer is more than one file, the
  system has failed and the research should say why.
- **Dark mode and theming**, since CSS-variable tokens make it nearly free — is it free here?
- **Where components fit.** Tokens aren't components. What's the minimum component layer above
  them (button, input, card, dialog) and does anything off-the-shelf compose with hand-rolled
  tokens without dragging in its own opinions?

Answer with the structure to build, with real code shapes — this ticket's output is what ticket 06
prototypes against.

## Answer

**One file — `client/src/theme.css`** — in six sections, plus four hand-written components in
`client/src/ui/` (Button, Field, Card, Modal). No component library. Full findings and code:
[research/03-design-token-system.md](../research/03-design-token-system.md).

1. `@theme` **primitives** — palette ramps, `--spacing`, `--text-*`, `--radius-*`, opened with
   `--color-*: initial`
2. `:root` — **semantic aliases** (`--surface`, `--ink`, `--accent`, `--line`, `--elev-*`) pointing
   at primitives
3. `[data-theme="dark"]` — same keys, different primitives
4. `@theme inline` — registers the semantics so `bg-surface` / `text-ink` / `shadow-card` exist
5. `@layer base` — page ground
6. `@layer components` — one `.recipe-body`, for extracted content with no JSX to hang a class on

Verified by compiling against a freshly installed **Tailwind 4.3.3**, not from memory:

- **v4 is current**; v3 is now the `v3-lts` tag. There is no `tailwind.config.js` — JS configs
  aren't auto-detected, `resolveConfig` is gone, `theme()` deprecated. `@tailwindcss/vite` peers
  Vite 5.2–8, so **the client's Vite 6 + React 18 need no upgrade**.
- **`@theme inline` is mandatory for anything theme-dependent.** Plain `@theme` resolves
  `var(--surface)` once on `:root`, so dark mode silently never applies — confirmed by compiling
  both. It's the CSS spec ("variables always draw from the computed value on the same element"),
  not a Tailwind quirk, and it bites `--shadow-*` as well as colours.
- **`--color-*: initial` is the enforcement mechanism**, not a convention: with it, `bg-red-500`
  and `text-gray-500` compile to *zero rules*, so a component physically cannot name a colour.
  Remaining hole: `bg-[#ff0000]` still compiles, with no first-party switch. Not worth a lint rule.
- **The swap test passes for a re-skin, in one file** — no generated utility contains a literal;
  every one reads a `var()`. Density is the standout: `p-4` compiles to
  `calc(var(--spacing) * 4)`, so one character retunes the whole app. **The honest ceiling**: it
  can't change *which* token a component picks, or a component's shape. So the real metric is "is
  the second file small" — ~120 lines here.
- **Dark mode costs four things**: the `@custom-variant` line, a blocking inline script against
  FOUC, `color-scheme` for native controls, and accepting that shadows and saturated accents need
  genuinely different values rather than inverted ones.
- **Native `<dialog>` beats a library** — its support floor (Chrome 37 / Firefox 98 / Safari 15.4)
  is a strict subset of Tailwind v4's own. Two gotchas found in the compiled Preflight: `margin: 0`
  on `*` kills UA centring (needs `m-auto`), and the reset includes `::backdrop`.
- Headless UI / Radix / React Aria all compose fine with hand-rolled tokens but earn nothing until
  scran needs a combobox. **shadcn/ui uses this exact architecture** — which validates the shape,
  but it brings ~35 token names and Radix. Steal the shape, write the names.
