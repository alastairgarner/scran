# UI foundations

Direction: a warm, contemporary household cookbook; editorial content, quiet
utility controls. See `AGENTS.md`.

## Start here

Import from `client/src/ui.tsx`. Open **/ui** in an authenticated preview for
rendered examples, including disabled/error states and keyboard interactions.
Tokens and type roles live in `client/src/theme.css`; feature code must not
introduce a competing palette or type scale.

- **Button / ButtonLink**: primary, secondary, quiet, destructive; regular and
  compact (both retain at least 44px touch height). Button defaults to
  `type="button"`: explicitly use `type="submit"` in forms. `loading` disables
  the action; callers supply an appropriate label. Icon-only actions need an
  accessible name. Use ButtonLink for navigation, never a button with navigation
  hidden in its click handler.
- **Field / Textarea**: label, optional hint/error, native input props and refs.
  `hideLabel` hides only the visual label. `className` lays out the wrapper;
  control appearance belongs to the primitive. IDs and descriptions are wired
  automatically. Form state and validation rules belong to the feature.
- **Checkbox**: native labelled input, no custom checkbox state machine.
- **ChoiceChip**: `kind="choice"` requires selected/onClick; `kind="removable"`
  requires removeLabel/onRemove. Selection is not a primary action.
- **PageHeader**: title, optional back navigation, description and actions.
  `sticky` is explicit; it should not be inside an overflow-clipped ancestor.
- **Section**: heading, optional description/actions and content spacing.
  `reading` separates editorial sections from compact form groups. Ordinary
  flex/grid remains feature code; no generic layout engine.
- **Dialog**: native modal dialog, standard header/body/footer, optional header
  actions. Bottom sheet on phones, centred on desktop. Body scrolls while
  header/footer stay available. Escape and Close dismiss; `busy` disables
  dismissal during an in-flight destructive operation. Background is inert.
- **PersistentDrawer**: non-modal phone drawer, desktop sidebar at 64rem. Pair
  with `drawer-layout` on its layout container for collapsed-bar clearance;
  desktop layouts place the main content in column 2. Controlled open state,
  accessible toggle, safe areas, bounded scrolling. Collapsed phone content is
  hidden (not focusable off-screen). Escape closes and returns focus to the
  handle. No backdrop, focus trap, page scroll lock or drag/snap API.
- **Feedback / EmptyState**: inline status/error messages versus spacious
  page/section states with optional recovery actions.
- **Card**: retained for actual bounded surfaces (e.g. authentication). Do not
  wrap every section in it.

## Keep in features

Recipe rows, ratings, serving controls, editable lines and photo review are domain
UI. `IngredientsPanel` owns ingredient rendering/scaling; PersistentDrawer owns
only its responsive container. Do not build a generic editable-list framework
until another feature actually needs it.

## Typography and colour

Serif `type-title` and `type-body` for titles and reading content. Sans-serif
`type-heading`, `type-control` and `type-label` for interface structure,
controls and metadata. Strong accent for primary actions, neutral selection
surface for selected controls. Prefer flat sections over nested cards.

## Changes

Migrate existing usages when changing a shared pattern. Check /ui **and** affected
real screens at phone and desktop sizes, with keyboard navigation, long content,
loading/empty/error states and drawer/dialog scrolling. Run `bun run check` and
`bun test`. The component examples complement real-screen validation; they do
not replace it.
