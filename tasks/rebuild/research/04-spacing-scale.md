# What spacing scale should scran lock down?

Researched 2026-09-10 from first-party design-system documentation.

## Recommendation

Lock margin, padding, gap, and `space-*` utilities to:

| Tailwind suffix | `0` | `1` | `2` | `3` | `4` | `6` | `8` | `12` | `16` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CSS value | 0 | .25rem | .5rem | .75rem | 1rem | 1.5rem | 2rem | 3rem | 4rem |
| At 16px root | 0 | 4px | 8px | 12px | 16px | 24px | 32px | 48px | 64px |

That is eight non-zero choices. It keeps fine control where compact UI needs it, then widens the
steps as values grow. Set Tailwind's base to `--spacing: 0.25rem`. Scran already uses this rhythm
heavily; outliers such as large bottom
clearances are layout constraints, not spacing tokens, and should remain separate.

Do **not** create semantic aliases such as `card-gap` yet. The numeric scale is enough until a
single layout value must change coherently across several components.

## Evidence

| System | Base/rhythm | Published scale | Count including zero |
| --- | --- | --- | --- |
| Android | 8dp for layout; 4dp for smaller elements | Grid guidance, not a finite token list | — |
| Carbon | 2px low-end; multiples of 2, 4, and 8 | 0, 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 160px | 14 |
| Atlassian | 8px base, with quarter steps below it | 0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80px | 14 |
| Primer | 4px smallest step; widening thereafter | 0, 4, 8, 16, 24, 32, 40, 48, 64, 80, 96, 112, 128px | 13 |
| Tailwind v4 | `--spacing` defaults to a 4px multiplier | Any numeric suffix; not finite | Unbounded |

Sources: [Android grids and units](https://developer.android.com/design/ui/mobile/guides/layout-and-content/grids-and-units),
[Carbon spacing](https://carbondesignsystem.com/elements/spacing/overview/),
[Atlassian spacing](https://atlassian.design/foundations/spacing),
[Primer padding scale](https://primer.style/product/css-utilities/padding/), and
[Tailwind theme variables](https://tailwindcss.com/docs/theme) and
[default source](https://github.com/tailwindlabs/tailwindcss/blob/main/packages/tailwindcss/theme.css).

## Why this subset

- **4px foundation:** shared by Android's fine grid, Primer, Tailwind, and nearly all Carbon and
  Atlassian values.
- **12px retained:** common in Carbon and Atlassian, and already useful throughout scran's compact
  mobile UI.
- **20px and 40px omitted:** adjacent 16/24px and 32/48px choices remove indecision with little
  expressive loss.
- **2px and 6px omitted:** useful for unusually dense enterprise controls; unnecessary here.
- **64px ceiling:** enough for section-level separation. Larger values usually encode component
  height, navigation clearance, safe-area treatment, or viewport layout rather than rhythm.

Tailwind's single `--spacing` variable also drives sizing utilities, so a finite token declaration
would constrain more than spacing. Enforce this list only for margin, padding, gap, and `space-*`;
leave widths, heights, positioning, and `auto`/viewport/safe-area values outside it. Tailwind
documents the shared multiplier behavior for both [padding](https://tailwindcss.com/docs/padding)
and [sizing](https://tailwindcss.com/docs/min-height).
