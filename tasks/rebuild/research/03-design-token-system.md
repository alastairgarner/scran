# How is a swappable design token system built on Tailwind?

Research for [issue 03](../issues/03-design-token-system.md). Researched 2026-08-07.

Every code block below that shows compiled CSS was produced by actually running `@tailwindcss/cli`
**v4.3.3** over the input shown, not recalled. Method in [§9](#9-how-this-was-verified).

## TL;DR

- **Tailwind v4 is current** — `tailwindcss@4.3.3`, published 2026-07-16. `tailwind.config.js` is
  gone as an auto-detected concept; the theme lives in CSS under `@theme`. v3 is on life support as
  the `v3-lts` dist-tag (3.4.19).
- **Three layers, one file.** Primitives in `@theme` → semantic aliases in `:root` /
  `[data-theme="dark"]` → registered back into Tailwind with `@theme inline`. All of it is
  `client/src/theme.css`.
- **`@theme inline` is load-bearing, not stylistic.** Without it, semantic tokens silently ignore
  dark mode. This is a CSS spec consequence, not a Tailwind quirk ([§3](#3-why-theme-inline-is-mandatory)).
- **`--color-*: initial` is the enforcement mechanism.** Nuke the default palette and `bg-red-500`
  stops compiling. A component then *cannot* name a colour — no lint rule needed. Verified.
- **The swap test passes for a re-skin, and only a re-skin.** Palette, type scale, radii, density,
  elevation, light/dark mapping: one file. What a token swap can never change is *which* token a
  component reaches for, or a component's shape. See [§6](#6-the-swap-test) for the honest ceiling.
- **Component layer: 4 React files, no library.** `<dialog>` gives focus trap, Esc, inert
  background and top-layer for free, and its browser support is a strict subset of Tailwind v4's own
  floor. Skip Radix/Headless UI until scran needs a combobox.
- **Recommendation:** [§8](#8-recommendation).

---

## 1. Which Tailwind, and does it fit the client

npm registry, `tailwindcss` package metadata (fetched 2026-08-07):

| dist-tag | version | published |
| --- | --- | --- |
| `latest` | **4.3.3** | 2026-07-16 |
| `v3-lts` | 3.4.19 | 2025-12-10 |

The v4 line has been shipping steadily — 4.2.0 (2026-02-18), 4.3.0 (2026-05-08) — per the
[repo changelog](https://github.com/tailwindlabs/tailwindcss/blob/main/CHANGELOG.md). Nothing in
4.1→4.3 changes the theming API; the additions are utilities (`zoom-*`, `tab-*`, `scrollbar-*`,
logical properties) and canonicalization fixes.

`@tailwindcss/vite@4.3.3` declares `peerDependencies: { vite: "^5.2.0 || ^6 || ^7 || ^8" }`. The
client is on `vite@^6.0.5` and `react@^18.3.1` — both fine, no upgrade needed.

Install, per [Installation → Using Vite](https://tailwindcss.com/docs/installation/using-vite):

```bash
npm install tailwindcss @tailwindcss/vite
```

```ts
// client/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({ plugins: [react(), tailwindcss()] });
```

Browser floor is **Safari 16.4+, Chrome 111+, Firefox 128+** — v4 "depend[s] on modern CSS features
like `@property` and `color-mix()` for core framework features"
([Upgrade guide § Browser requirements](https://tailwindcss.com/docs/upgrade-guide#browser-requirements)).
Irrelevant for a LAN app on family phones, but it is the floor everything else in this document
inherits.

### v3 config vs v4 `@theme`

> JavaScript config files are still supported for backward compatibility, but they are no longer
> detected automatically in v4.

— [Upgrade guide § Using a JavaScript config file](https://tailwindcss.com/docs/upgrade-guide#using-a-javascript-config-file)

You'd have to opt in with `@config "../../tailwind.config.js"`, and `corePlugins`, `safelist` and
`separator` don't work there any more. `resolveConfig` was removed outright — the guide says to read
the generated CSS variables instead. **There is no reason to create a `tailwind.config.js` in a
greenfield v4 project.** Likewise `theme()` in CSS: "This function is deprecated, and we recommend
using CSS theme variables instead"
([Functions and directives § theme()](https://tailwindcss.com/docs/functions-and-directives#theme-function)).

### What `@theme` actually is

> Theme variables aren't *just* CSS variables — they also instruct Tailwind to create new utility
> classes that you can use in your HTML.

— [Theme variables § Why `@theme` instead of `:root`?](https://tailwindcss.com/docs/theme#why-theme-instead-of-root)

Namespaces are a fixed, published list, each wired to a utility family
([Theme variables § Theme variable namespaces](https://tailwindcss.com/docs/theme#theme-variable-namespaces)).
The ones that matter here:

| Namespace | Generates |
| --- | --- |
| `--color-*` | `bg-*`, `text-*`, `border-*`, `fill-*`, … |
| `--text-*` | `text-xl` (font-size; paired `--text-xl--line-height` sets leading) |
| `--font-*` | `font-sans` |
| `--font-weight-*`, `--tracking-*`, `--leading-*` | `font-bold`, `tracking-wide`, `leading-tight` |
| `--spacing-*` | `px-4`, `gap-6`, `max-h-16`, … |
| `--radius-*` | `rounded-lg` |
| `--shadow-*`, `--inset-shadow-*`, `--drop-shadow-*` | `shadow-md`, … |
| `--breakpoint-*` | the `sm:` / `md:` variants |
| `--container-*` | `max-w-md` and `@sm:` container queries |
| `--ease-*`, `--animate-*` | `ease-out`, `animate-spin` |

Two properties of this list are what make the whole scheme work:

1. **It is closed.** You cannot invent a `--elevation-*` namespace and get `elevation-2` utilities.
   Non-namespace tokens are plain CSS variables you consume by hand or via arbitrary values.
2. **Every default utility is theme-driven.** Per
   [Theme variables § Default theme variables](https://tailwindcss.com/docs/theme#default-theme-variables):
   "This is why utilities like `bg-red-200`, `font-serif`, and `shadow-sm` exist out of the box —
   they're driven by the default theme, not hardcoded into the framework." Which means the defaults
   can be *deleted*, and that is [§4](#4-enforcement-delete-the-default-palette).

---

## 2. The three-layer structure

Primitives are facts about the palette ("paprika 600 is this colour"). Semantics are decisions
("the accent is paprika 600"). Components consume only semantics. The layering exists so that
dark mode and re-skinning are edits to the *decisions*, never to the components.

```
┌─ @theme ──────────────────┐   raw scales. no meaning. never referenced by a component.
│  --color-stone-50 … 950   │
│  --color-paprika-400/600  │
│  --spacing, --text-*,     │
│  --radius-*, --font-*     │
└───────────┬───────────────┘
            │ referenced by
┌───────────▼───────────────┐   the decisions. mode-dependent. two blocks: light and dark.
│  :root { --surface: … }   │
│  [data-theme=dark] { … }  │
└───────────┬───────────────┘
            │ registered by
┌───────────▼───────────────┐   turns semantics into real utilities: bg-surface, text-ink
│  @theme inline { … }      │
└───────────┬───────────────┘
            │ consumed by
┌───────────▼───────────────┐
│  ui/*.tsx  <Button/> …    │   only ever names semantics.
└───────────────────────────┘
```

This is not an invention. It is what Tailwind's own colour docs prescribe for a token that changes
with theme ([Colors § Referencing other variables](https://tailwindcss.com/docs/colors#referencing-other-variables)):

```css
@import "tailwindcss";

:root {
  --acme-canvas-color: oklch(0.967 0.003 264.542);
}

[data-theme="dark"] {
  --acme-canvas-color: oklch(0.21 0.034 264.665);
}

@theme inline {
  --color-canvas: var(--acme-canvas-color);
}
```

It is also, verbatim, the architecture [shadcn/ui uses](https://ui.shadcn.com/docs/theming) —
`:root` / `.dark` semantic variables re-registered through `@theme inline`. Worth knowing because
it means this shape is well-trodden, and because shadcn's *token vocabulary* (`--background`,
`--foreground`, `--primary`, `--muted`, `--ring`, plus sidebar and chart sets — roughly 35 names)
is a thing you can steal or ignore. There is no technical reason to adopt its names. See
[§7](#7-the-component-layer).

---

## 3. Why `@theme inline` is mandatory

This is the single fact most likely to cost a day if it isn't known up front.

Compiling this input with Tailwind 4.3.3 — the `inline` case and the non-`inline` control, side
by side:

```css
:root            { --surface: var(--color-clay-50);  }
[data-theme=dark]{ --surface: var(--color-clay-900); }

@theme inline { --color-surface: var(--surface); }        /* correct */
@theme        { --color-surface-broken: var(--surface); } /* control */
```

produces:

```css
@layer theme {
  :root, :host {
    --color-surface-broken: var(--surface);   /* ← resolved HERE, on :root */
  }
}
@layer utilities {
  .bg-surface        { background-color: var(--surface); }               /* ✅ */
  .bg-surface-broken { background-color: var(--color-surface-broken); }  /* ❌ */
}
```

`.bg-surface` emits `var(--surface)` — an unresolved reference that lands on the *element*, where
`--surface` inherits whatever `[data-theme="dark"]` last set. Dark mode works.

`.bg-surface-broken` emits `var(--color-surface-broken)`, and `--color-surface-broken` was resolved
once, on `:root`, against the light value. It is permanently light. The failure is silent — no
warning, no error, the colour is just wrong in dark mode.

The reason is in the CSS spec, not in Tailwind. [CSS Custom Properties for Cascading Variables
Module Level 1, § 3 Using Cascading Variables](https://drafts.csswg.org/css-variables-1/#using-variables):

> Variables always draw from the computed value of the associated custom property on the same
> element.

and the substitution algorithm: "Let *result* be the **computed value** of the corresponding custom
property on *el*." Custom properties are declared `Inherited: yes` (§ 2), so the whole scheme rests
on inheritance from the `[data-theme]` element down.

Tailwind states the same thing in its own words
([Theme variables § Referencing other variables](https://tailwindcss.com/docs/theme#referencing-other-variables)):

> Using the `inline` option, the utility class will use the theme variable *value* instead of
> referencing the actual theme variable. […] Without using `inline`, your utility classes might
> resolve to unexpected values because of how variables are resolved in CSS.

**Rule: any token whose value depends on theme must go through `@theme inline`. Any token that is
the same in every theme (the type scale, radii, `--spacing`) can use plain `@theme`.**

This applies to more than colours. Verified for `--shadow-*`:

```css
:root             { --elev-1: 0 1px 3px rgb(0 0 0 / 0.12); }
[data-theme=dark] { --elev-1: 0 0 0 1px rgb(255 255 255 / 0.08); }
@theme inline     { --shadow-card: var(--elev-1); }
```
```css
.shadow-card { --tw-shadow: var(--elev-1); box-shadow: …, var(--tw-shadow); }
```

One caveat that falls out of this: `.bg-surface` emits `var(--surface)` with **no fallback**. Misname
a semantic token and the declaration is invalid at computed-value time — the element gets no
background at all, silently. Define the semantic set in exactly one place and keep light and dark
adjacent so a missing key is visible.

### Two mechanisms that are *not* the answer

- **`light-dark()`** — Tailwind documents `bg-[light-dark(var(--color-white),var(--color-gray-950))]`
  ([Colors § Referencing in CSS](https://tailwindcss.com/docs/colors#referencing-in-css)). It keys
  off `color-scheme` only, so a user-controlled three-way toggle has to drive `color-scheme` on the
  root anyway, and every token becomes a two-argument function. Strictly worse than one override
  block.
- **`@theme` inside a media query** — not possible. "Theme variables must be defined top-level"
  ([Theme variables](https://tailwindcss.com/docs/theme#why-theme-instead-of-root)). This is
  *precisely* why the semantic layer has to be plain `:root` CSS rather than more `@theme`.

---

## 4. Enforcement: delete the default palette

The stated goal is that a component never names a colour directly. Convention won't hold that; the
build can.

```css
@theme {
  --color-*: initial;
  --color-white: #fff;
  /* … only your ramps … */
}
```

> Use `--color-*: initial` to completely disable all of the default colors and define your own
> custom color palette.

— [Colors § Using a custom palette](https://tailwindcss.com/docs/colors#using-a-custom-palette)

Verified: with `--color-*: initial` in place, compiling markup containing
`class="bg-red-500 text-gray-500"` produced **zero** matching rules. The classes don't exist. A
component that writes `text-gray-500` renders unstyled and gets caught in the first screenshot.
No ESLint plugin, no review checklist, no find-and-replace risk.

The same `*: initial` trick works per-namespace (`--text-*: initial`, `--radius-*: initial`,
`--color-lime-*: initial`) and globally (`--*: initial`)
([Theme variables § Overriding the default theme](https://tailwindcss.com/docs/theme#overriding-the-default-theme)).
Deleting `--text-*` and `--radius-*` too is worth it: it forces the type scale and radii to be
decisions rather than a grab-bag of 13 sizes.

**The remaining hole,** verified: arbitrary values still compile.

```css
.bg-\[\#ff0000\] { background-color: #ff0000; }
.p-\[13px\]      { padding: 13px; }
```

There is no first-party switch to disable arbitrary values. Don't add a linter for this — the
escape hatch is a literal hex code in a diff, which is about as visible as a code smell gets, and
it's occasionally the right answer.

---

## 5. The token file

One file, `client/src/theme.css`, imported once from `main.tsx`. Sections in dependency order.
Values below are illustrative "cookbook"; the structure is the deliverable.

```css
/* client/src/theme.css */
@import "tailwindcss";

/* Dark is a manual toggle, not a media query — a user can pin light on a dark phone.
   Boot script resolves "system" to an explicit attribute before first paint. */
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

/* ─── 1. PRIMITIVES ────────────────────────────────────────────────────────
   Raw scales. No meaning attached. A component must never name one of these. */
@theme {
  --color-*: initial;              /* bg-red-500 no longer compiles. see §4 */
  --text-*: initial;
  --radius-*: initial;

  --color-white: #fff;
  --color-black: #000;

  /* neutral ramp — warm, because cookbook */
  --color-stone-50:  oklch(0.985 0.004 75);
  --color-stone-100: oklch(0.960 0.007 75);
  --color-stone-200: oklch(0.917 0.011 73);
  --color-stone-400: oklch(0.700 0.017 68);
  --color-stone-500: oklch(0.585 0.019 65);
  --color-stone-700: oklch(0.395 0.019 62);
  --color-stone-900: oklch(0.243 0.014 60);
  --color-stone-950: oklch(0.168 0.011 58);

  /* brand + status ramps */
  --color-paprika-400: oklch(0.720 0.150 42);
  --color-paprika-600: oklch(0.560 0.165 38);
  --color-paprika-700: oklch(0.480 0.150 37);
  --color-rust-500:    oklch(0.575 0.200 27);
  --color-rust-400:    oklch(0.680 0.180 27);

  /* DENSITY. every p-*, gap-*, m-*, size-* multiplies this one number. */
  --spacing: 0.25rem;

  /* TYPE. one family pair + a five-step scale. */
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-display: Georgia, "Iowan Old Style", ui-serif, serif;

  --text-caption: 0.8125rem;  --text-caption--line-height: 1.45;
  --text-body:    1.0625rem;  --text-body--line-height: 1.6;   /* read propped on a worktop */
  --text-lead:    1.25rem;    --text-lead--line-height: 1.45;
  --text-title:   1.5rem;     --text-title--line-height: 1.25;
  --text-display: 1.9375rem;  --text-display--line-height: 1.15;

  --radius-control: 0.5rem;
  --radius-card:    0.875rem;

  --breakpoint-*: initial;
  --breakpoint-sm: 40rem;      /* phone-first; one breakpoint is genuinely enough here */
}

/* ─── 2. SEMANTICS — LIGHT ─────────────────────────────────────────────────
   The decisions. This block and the next are what a re-skin edits. */
:root {
  color-scheme: light;

  --surface:        var(--color-stone-50);
  --surface-raised: var(--color-white);
  --surface-sunken: var(--color-stone-100);

  --ink:            var(--color-stone-900);
  --ink-muted:      var(--color-stone-500);
  --ink-on-accent:  var(--color-white);

  --line:           var(--color-stone-200);
  --accent:         var(--color-paprika-600);
  --accent-hover:   var(--color-paprika-700);
  --danger:         var(--color-rust-500);
  --focus:          var(--color-paprika-600);

  --elev-card:      0 1px 2px oklch(0 0 0 / 0.05), 0 4px 12px oklch(0 0 0 / 0.05);
  --elev-overlay:   0 12px 40px oklch(0 0 0 / 0.20);
}

/* ─── 3. SEMANTICS — DARK ──────────────────────────────────────────────────
   Same keys, different primitives. Not a strict inversion — see §6. */
[data-theme="dark"] {
  color-scheme: dark;

  --surface:        var(--color-stone-950);
  --surface-raised: var(--color-stone-900);
  --surface-sunken: var(--color-black);

  --ink:            var(--color-stone-100);
  --ink-muted:      var(--color-stone-400);
  --ink-on-accent:  var(--color-stone-950);

  --line:           var(--color-stone-700);
  --accent:         var(--color-paprika-400);   /* 600 has no contrast on near-black */
  --accent-hover:   var(--color-paprika-400);
  --danger:         var(--color-rust-400);
  --focus:          var(--color-paprika-400);

  --elev-card:      0 0 0 1px oklch(1 0 0 / 0.07);   /* drop shadows vanish on dark */
  --elev-overlay:   0 0 0 1px oklch(1 0 0 / 0.10), 0 16px 48px oklch(0 0 0 / 0.60);
}

/* ─── 4. REGISTER ──────────────────────────────────────────────────────────
   Turns semantics into utilities. `inline` is mandatory here — see §3. */
@theme inline {
  --color-surface:        var(--surface);
  --color-surface-raised: var(--surface-raised);
  --color-surface-sunken: var(--surface-sunken);
  --color-ink:            var(--ink);
  --color-ink-muted:      var(--ink-muted);
  --color-ink-on-accent:  var(--ink-on-accent);
  --color-line:           var(--line);
  --color-accent:         var(--accent);
  --color-accent-hover:   var(--accent-hover);
  --color-danger:         var(--danger);
  --color-focus:          var(--focus);

  --shadow-card:    var(--elev-card);
  --shadow-overlay: var(--elev-overlay);
}

/* ─── 5. BASE ──────────────────────────────────────────────────────────────
   Page defaults. Tailwind's Preflight already zeroes margins and sets
   font-family from --font-sans; this is the app-level ground. */
@layer base {
  body {
    background-color: var(--surface);
    color: var(--ink);
    font-size: var(--text-body);
    line-height: var(--text-body--line-height);
  }
}

/* ─── 6. HTML WE DON'T EMIT ────────────────────────────────────────────────
   The only justified use of a CSS component class in a React app: styling
   markup produced by something else — here, extracted recipe bodies, where
   there is no JSX to hang a className on. */
@layer components {
  .recipe-body {
    h2 { font-family: var(--font-display); font-size: var(--text-title); margin-block: --spacing(6) --spacing(2); }
    p, li { font-size: var(--text-body); line-height: var(--text-body--line-height); }
    li { margin-block: --spacing(2); }
    a  { color: var(--accent); text-decoration: underline; }
    code { background-color: var(--surface-sunken); border-radius: var(--radius-control); }
  }
}
```

Notes on the mechanics used above:

- `--spacing(6)` is a build-time function that expands to `calc(var(--spacing) * 6)`
  ([Functions and directives § `--spacing()`](https://tailwindcss.com/docs/functions-and-directives#spacing-function)),
  so hand-written CSS stays on the same density knob as the utilities.
- `--alpha(var(--ink) / 10%)` compiles to `color-mix(in oklab, var(--ink) 10%, transparent)`
  ([§ `--alpha()`](https://tailwindcss.com/docs/functions-and-directives#alpha-function)) if you need
  a tint in custom CSS.
- Theme variables that are never used are dropped from the output. If tokens need to be readable
  from JS (`getComputedStyle(document.documentElement).getPropertyValue("--shadow-card")`), use
  `@theme static` ([§ Generating all CSS variables](https://tailwindcss.com/docs/theme#generating-all-css-variables)).
- `@layer components` is the right layer for `.recipe-body` because "you can still use utility
  classes to override them when necessary"
  ([Adding custom styles § Adding component classes](https://tailwindcss.com/docs/adding-custom-styles#adding-component-classes)).

### Semantic naming: where it breaks down

The ticket asks where the semantic layer stops working. Three real places:

1. **Foreground/background pairs multiply.** `--accent` is useless without `--ink-on-accent`. Every
   filled surface needs its readable text colour defined *beside* it, or a palette swap produces
   an unreadable button. Keep the pairs adjacent in the file; that's the whole mitigation.
2. **Nothing checks contrast.** Semantic indirection hides the primitive, so swapping the ramp can
   silently drop text below WCAG AA and the build will be perfectly happy. The swap test is not
   "does it compile", it is "does it compile *and* still pass a contrast check". This is the genuine
   cost of the abstraction and there is no first-party tooling for it.
3. **States tempt you into token sprawl.** Resist a token per interaction state. Tailwind's opacity
   modifier works on semantic tokens — verified, `bg-ink/60` compiles to
   `color-mix(in oklab, var(--ink) 60%, transparent)` — which covers most hover/disabled treatments
   with no new tokens. Only add an explicit token (`--accent-hover` above) where a mix genuinely
   looks wrong, which in practice is filled accent surfaces.

---

## 6. The swap test

**Changing scran from "cookbook" to "app" — palette, type scale, radii, density — touches exactly
one file: `client/src/theme.css`.** Concretely:

| Change | Where | Lines |
| --- | --- | --- |
| Whole palette | §1 primitive ramps | ~14 |
| Type scale + families | §1 `--font-*`, `--text-*` | ~7 |
| Radii | §1 `--radius-*` | 2 |
| **Density** | §1 `--spacing` | **1** |
| Light mapping | §2 `:root` | ~15 |
| Dark mapping | §3 `[data-theme]` | ~15 |
| Elevation | §2/§3 `--elev-*` | 4 |

Density deserves the emphasis. Verified compile output:

```css
.p-4  { padding: calc(var(--spacing) * 4); }
.gap-6{ gap:     calc(var(--spacing) * 6); }
```

Every spacing utility in the app is a multiple of one variable. `--spacing: 0.25rem` → `0.2rem`
tightens the entire app by 20% in one character. Nothing else in Tailwind gives that leverage, and
it only works because you never wrote a raw `px` value.

This holds because — verified across the whole compiled sheet — **no generated utility contains a
literal value.** Every one reads a `var()`. There is no find-and-replace surface.

### What the swap does *not* change, and why that's not a failure

A token system controls *what the values are*. It cannot control *which token a component picks* or
*what shape the component is*. So:

- **Re-skin** (same layout, different look) → `theme.css` only. ✅ One file.
- **Re-shape** (cards get hairline borders instead of shadows; the recipe header stacks instead of
  sitting inline; buttons go from filled to outline) → `theme.css` *plus* the file for the component
  that changed. That is not a token problem and no token system solves it — a variable cannot decide
  that a card has a border and no shadow.

This is why the component layer must stay tiny ([§7](#7-the-component-layer)). The real metric isn't
"is it one file", it's **"is the second file small"**. Four ~30-line components is a small second
file. Forty is not, and that is the failure mode to watch for in ticket 06.

One genuine limit worth stating: because the semantic layer is a flat set of names, there is no
mechanism for a *third* theme (a "print" or "high contrast" mode) beyond adding another
`[data-theme="…"]` block with the same keys. That scales fine to three or four; it is not a theming
engine and shouldn't grow into one.

---

## 7. Dark mode: nearly free, not free

Cost, itemised:

**Free.** The `dark:` variant, the `[data-theme]` override block, and the fact that every component
already reads `bg-surface` / `text-ink` and therefore needs *zero* `dark:` classes. This is the
main payoff of the semantic layer: with hardcoded palettes you write `dark:` on every element; with
semantic tokens you write it almost nowhere.

**Costs four things:**

1. **Pick attribute over media query.** Default `dark:` keys off `prefers-color-scheme`; overriding
   it takes one line ([Dark mode § Toggling dark mode manually](https://tailwindcss.com/docs/dark-mode#toggling-dark-mode-manually)):

   ```css
   @custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));
   ```

   Verified output: `.dark\:bg-clay-500:where([data-theme=dark], [data-theme=dark] *) { … }` — a
   `:where()` wrapper, so zero specificity cost.

2. **A blocking script, or you get a flash.** The docs say "best to add inline in `head` to avoid
   FOUC" ([Dark mode § With system theme support](https://tailwindcss.com/docs/dark-mode#with-system-theme-support)).
   Adapted to the data-attribute form, in `client/index.html` before the module script:

   ```html
   <script>
     document.documentElement.dataset.theme =
       localStorage.theme ??
       (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
   </script>
   ```

   Resolving "system" to an explicit attribute at boot means `:root` and `[data-theme="dark"]` are
   the only two states the CSS has to model, and `color-scheme` in §2/§3 is always correct.

3. **`color-scheme` must be set** or native form controls, scrollbars and `<input type="date">`
   pickers stay light on a dark page. Handled by the `color-scheme` declarations in the token file;
   Tailwind also ships `scheme-light` / `scheme-dark` utilities
   ([color-scheme](https://tailwindcss.com/docs/color-scheme)) if you need it per-element.

4. **Dark is not an inversion.** Two things need genuinely different values, not swapped ones:
   - *Shadows.* A drop shadow is invisible on a dark surface. Elevation has to become a hairline
     border — hence `--elev-card: 0 0 0 1px oklch(1 0 0 / 0.07)` in §3.
   - *Saturated colours.* `--color-paprika-600` at AA on white is unreadable on near-black; dark mode
     needs the 400. Any accent that also carries text needs re-picking, not re-using.

   Both are two lines in the override block. But they are thought, not mechanism, and no amount of
   tokenisation removes them.

**Photos.** scran is photo-heavy. Recipe images don't respond to any of this; if a captured page
looks harsh against `--surface-sunken` in dark mode the fix is a container treatment on the image
component, not a token. Flagging it for ticket 06 rather than solving it here.

---

## 8. The component layer

Tokens are not components. The question is what the minimum layer is, and whether anything
off-the-shelf composes without dragging in opinions.

### Take the platform first

For **button, input, card**, there is nothing to buy. A `<button>` is already a button. The layer is
a React component holding a class string and a variant lookup — no library, no `cva`, no
`tailwind-merge`:

```tsx
// client/src/ui/Button.tsx
const variants = {
  primary: "bg-accent text-ink-on-accent hover:bg-accent-hover",
  quiet:   "text-ink-muted hover:bg-surface-sunken hover:text-ink",
  danger:  "bg-danger text-ink-on-accent hover:bg-danger/90",
} as const;

const sizes = {
  md: "min-h-11 px-4 text-body",     // 44px floor — phones, wet hands, chopping board
  sm: "min-h-9 px-3 text-caption",
} as const;

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export function Button({ variant = "primary", size = "md", className = "", ...rest }: Props) {
  return (
    <button
      {...rest}
      className={
        "inline-flex items-center justify-center gap-2 rounded-control font-medium " +
        "transition-colors disabled:pointer-events-none disabled:opacity-50 " +
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
        `${variants[variant]} ${sizes[size]} ${className}`
      }
    />
  );
}
```

Not one colour named. Not one `dark:`. The variant record is a plain object — `cva` (0.7.1, last
published 2024-11-26) adds a dependency to do exactly this lookup, and `tailwind-merge` (3.6.0)
only earns its place when callers routinely override arbitrary classes, which a closed three-variant
set doesn't. Both are trivially added later if the string concatenation actually bites.

`hover:bg-danger/90` is worth noting: the opacity modifier works on semantic tokens (verified —
compiles to `color-mix(in oklab, var(--danger) 90%, transparent)`), so states mostly don't need
their own tokens.

### Dialog: use `<dialog>`

`<dialog>` + `showModal()` gives focus trapping, Esc-to-close, the rest of the page marked inert,
top-layer stacking (no z-index war) and a `::backdrop` pseudo-element — all from the browser.

Browser support from [MDN's browser-compat-data](https://github.com/mdn/browser-compat-data/blob/main/html/elements/dialog.json):
**Chrome 37, Firefox 98, Safari 15.4**. Tailwind v4 itself requires Chrome 111 / Firefox 128 /
Safari 16.4. **If you can run Tailwind v4, you have `<dialog>`.** There is no support argument for
a library here.

```tsx
// client/src/ui/Modal.tsx
export function Modal({ open, onClose, children }: {
  open: boolean; onClose: () => void; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // m-auto: Preflight zeroes margin on *, which kills <dialog>'s UA centring.
      // backdrop:*: Preflight's reset includes ::backdrop, so style it explicitly.
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-card bg-surface-raised
                 p-6 text-ink shadow-overlay backdrop:bg-black/50"
    >
      {children}
    </dialog>
  );
}
```

The two comments are real gotchas, not hypotheticals. Verified Preflight output:

```css
*, ::after, ::before, ::backdrop, ::file-selector-button {
  box-sizing: border-box; margin: 0; padding: 0; border: 0 solid;
}
```

`::backdrop` is in that reset list and `margin: 0` defeats the UA's `margin: auto` centring. Without
`m-auto` the dialog sits top-left and looks broken.

### So the minimum layer is four files

`ui/Button.tsx`, `ui/Field.tsx` (label + input + error, wiring `htmlFor`/`id`/`aria-describedby`),
`ui/Card.tsx`, `ui/Modal.tsx`. Roughly 120 lines total. Everything else in scran is layout, which
belongs in the feature component, not in a design system.

### What off-the-shelf would compose, if it were needed

All three of these are genuinely unstyled and would consume the tokens above without complaint:

| Package | Version (2026-08-07) | React 18 | Verdict |
| --- | --- | --- | --- |
| [`@headlessui/react`](https://headlessui.com/react/dialog) | 2.2.10 | `^18 \|\| ^19` ✓ | Tailwind Labs' own. "Style the `Dialog` … using the `className` or `style` props like you would with any other element." No stylesheet to import. Pulls `@floating-ui`, `@react-aria/focus`, `@tanstack/react-virtual`. |
| `@radix-ui/react-*` | dialog 1.1.23 | `^18` ✓ | Unstyled, state via `data-*` attributes. Per-primitive packages. |
| `react-aria-components` | 1.20.0 | `^18` ✓ | Unstyled, best-in-class a11y, but ships an optional stylesheet and a large dependency graph. |
| `@base-ui-components/react` | 1.0.0-rc.0 (2025-12-04) | — | Still RC eight months on. Skip. |

**None of them is worth adding for scran's v1.** They earn their place at combobox, listbox, menu
and toast — components with real keyboard-navigation state machines. scran has none of those yet.
Add one when a combobox appears, not before.

**shadcn/ui specifically:** its `:root` / `.dark` / `@theme inline` architecture is the same as
§5 and validates the design. But it is a code-generator, not a library — it copies components in
with its own ~35-name token vocabulary (`--background`, `--foreground`, `--primary`,
`--muted-foreground`, `--ring`, plus sidebar and chart sets) and a Radix dependency per component.
For a stated learning exercise where the point is hand-rolling the tokens, adopting it defeats the
exercise. Steal the shape; write the names.

---

## RECOMMENDATION

1. `npm install tailwindcss @tailwindcss/vite` in `client/`, add `tailwindcss()` to
   `vite.config.ts`. No `tailwind.config.js` — it doesn't exist in v4.
2. Replace `client/src/main.css` with `client/src/theme.css` as laid out in [§5](#5-the-token-file):
   six sections, one file, primitives → semantics(light) → semantics(dark) → `@theme inline`
   → `@layer base` → one `.recipe-body` class.
3. Open with `--color-*: initial`, `--text-*: initial`, `--radius-*: initial`. The default palette's
   absence is the enforcement mechanism; nothing else is needed to stop components naming colours.
4. Every theme-dependent token goes through `@theme inline`. Everything mode-invariant uses plain
   `@theme`. Getting this backwards breaks dark mode silently.
5. Dark mode via `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *))`, resolved
   to an explicit attribute by an inline script in `index.html` before first paint, with
   `color-scheme` set in both blocks.
6. Component layer: four hand-written files under `client/src/ui/` — Button, Field, Card, Modal.
   Native `<dialog>` for Modal. No component library, no `cva`, no `tailwind-merge` until something
   with real keyboard state (a combobox) actually appears.
7. **Ticket 06 should prove the swap, not just the look.** Build the cookbook theme, then write a
   second `@theme`/semantic block as "app" and confirm the whole app re-skins with no `.tsx` touched
   — and check contrast on both. That is the only test that tells you the system works.

### Deliberately skipped

- A JS config file, `resolveConfig`, `theme()` — all legacy-compat in v4.
- `cva` / `tailwind-merge` / `clsx` — a plain variant record and string concatenation do it.
  Add `tailwind-merge` if callers start needing to override component internals.
- A lint rule banning arbitrary values — the missing palette catches the systematic case; a raw hex
  in a diff is visible.
- A third theme, runtime theme editing, `@theme static` — YAGNI. All of them are additive later.

---

## 9. How this was verified

Every compiled-CSS excerpt above came from `npx @tailwindcss/cli -i … -o …` against
`tailwindcss@4.3.3` installed fresh on 2026-08-07, not from memory or documentation. Specifically
confirmed by compilation:

- `@theme inline` → `.bg-surface { background-color: var(--surface) }`; plain `@theme` →
  `.bg-surface-broken { background-color: var(--color-surface-broken) }` with the variable resolved
  on `:root`. ([§3](#3-why-theme-inline-is-mandatory))
- `--color-*: initial` removes `bg-red-500` and `text-gray-500` entirely (0 matching rules).
- `bg-[#ff0000]` and `p-[13px]` still compile. ([§4](#4-enforcement-delete-the-default-palette))
- `p-4` → `calc(var(--spacing) * 4)`; `gap-6` → `calc(var(--spacing) * 6)`. ([§6](#6-the-swap-test))
- `@theme inline` works for `--shadow-*`, not just `--color-*`.
- Custom `--text-step-1` + `--text-step-1--line-height` → `.text-step-1 { font-size: …;
  line-height: var(--tw-leading, var(--text-step-1--line-height)) }`.
- `bg-ink/60` → `color-mix(in oklab, var(--ink) 60%, transparent)` — opacity modifiers work on
  semantic tokens.
- `@apply` inside `@layer components` resolves through custom tokens.
- Preflight's reset covers `::backdrop` and sets `margin: 0` on `*`. ([§8](#8-the-component-layer))
- `.dark\:*` compiles to a zero-specificity `:where()` wrapper.

Package versions read from the npm registry on 2026-08-07. Browser support read from
[mdn/browser-compat-data](https://github.com/mdn/browser-compat-data). Spec text from the
[CSS Custom Properties Level 1 editor's draft](https://drafts.csswg.org/css-variables-1/).

## Sources

- [Theme variables](https://tailwindcss.com/docs/theme) —
  [`theme.mdx`](https://github.com/tailwindlabs/tailwindcss.com/blob/main/src/docs/theme.mdx)
- [Colors](https://tailwindcss.com/docs/colors) —
  [`colors.mdx`](https://github.com/tailwindlabs/tailwindcss.com/blob/main/src/docs/colors.mdx)
- [Dark mode](https://tailwindcss.com/docs/dark-mode) —
  [`dark-mode.mdx`](https://github.com/tailwindlabs/tailwindcss.com/blob/main/src/docs/dark-mode.mdx)
- [Functions and directives](https://tailwindcss.com/docs/functions-and-directives)
- [Adding custom styles](https://tailwindcss.com/docs/adding-custom-styles)
- [color-scheme](https://tailwindcss.com/docs/color-scheme)
- [Upgrade guide](https://tailwindcss.com/docs/upgrade-guide)
- [Installation → Using Vite](https://tailwindcss.com/docs/installation/using-vite)
- [tailwindcss CHANGELOG](https://github.com/tailwindlabs/tailwindcss/blob/main/CHANGELOG.md)
- [CSS Custom Properties for Cascading Variables Level 1](https://drafts.csswg.org/css-variables-1/)
- [mdn/browser-compat-data — `html/elements/dialog.json`](https://github.com/mdn/browser-compat-data/blob/main/html/elements/dialog.json)
- [Headless UI — Dialog](https://headlessui.com/react/dialog)
- [shadcn/ui — Theming](https://ui.shadcn.com/docs/theming)
