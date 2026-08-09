# What does scran look like?

Type: prototype
Status: resolved
Assignee: alastair
Blocked by: 03

## Question

The prototype's UI was whatever fell out of 154 lines. This effort has a design system, so the
look is now a decision rather than an accident — and it's the one decision here that can't be
settled by argument. Build something to react to.

The question underneath: **is this a cookbook or an app?** A recipe you cook from on a phone
propped against a bag of flour is a different artifact from a list you browse — big type, high
contrast, ingredients you can find at a glance with wet hands, versus density and navigation.

Prototype, against ticket 03's token structure:

- the **recipe page** — the screen that matters, the one used while cooking
- the **catalogue** — list or grid, what a recipe looks like before you open it, given that most
  have no image beyond the source photo
- enough of **capture** to see how a photo goes in
- the **swap test**: change the tokens and show the whole thing restyled. If that doesn't work
  cheaply, ticket 03's answer was wrong and this ticket found out.

Throwaway code, real content — use the 7 recipes already in `data/scran.db`. Link the prototype
from this ticket.

## Answer

**An app, not a cookbook** — and a *tool* rather than a document. Settled across three rounds of
throwaway variants at `client/prototype.html` (`bun run proto`), driven from real content in
`data/scran.db`. Nine variants were built and eight were cut; what survived:

### The recipe screen — method owns it, ingredients live in a bottom sheet

- Method fills the screen. Ingredients sit in a **bottom sheet** whose lip is always visible
  (`Ingredients · 8 lines · ⌃`) and is itself the control — no FAB, because a second button for a
  thing already on screen is noise. Opening it **moves nothing** in the method.
- Rejected: **tabs** (lose your place on every flip), **swipe panes** (the ingredients pane sits at
  `scrollLeft: 0`, so a right-swipe collides with the iOS left-edge back gesture and Android's
  gesture nav on *both* edges — unsuppressable from the web side, and once you add tabs and a
  button as a fallback, swipe is no longer load-bearing), **a pinned side panel** (fine on desktop,
  cramped on a phone), and **one long scroll with a segmented control** (kept longest as the
  low-risk fallback; cut once the sheet proved itself).
- **Step numbers sit above their paragraph** as a rule (`STEP 1 ────`), not in a left gutter — a
  gutter costs ~15% of line width on a 375px screen, which is exactly where it hurts.
- Page order follows the source: method → **From the page** (the recipe's own notes) → **What the
  house says** (rating, who rated what, comments) → **Source** (the photo). Every block carries a
  heading in the step-rule style; the notes block read as ambiguous purely because it was the only
  unlabelled thing on the page.
- Header carries **times and tags only** — the yield belongs on the stepper, where you'd change it.

### The catalogue — a list, no thumbnails

- **Name-first list**, no images at all. Every source photo is a photo of *text*, so a grid of them
  reads as a pile of documents; they're also actively misleading as recipe imagery.
- One **aggregate mark** per row, not five sets of initials.
- Bottom-anchored toolbar: search field, filter icon with an active count, and the `+` FAB. **No
  tab bar** — scran has exactly one destination, so a bottom nav would have been a two-item bar
  with one item lying. At `md:` it flips to a conventional top bar with `+ Add recipe`; the whole
  point of anchoring low is thumb reach, which desktop doesn't have.
- **Filter & sort in a bottom sheet** — same idiom as the ingredients panel, one gesture vocabulary.
  Sort by recently added (default) / name / quickest. Active filters stay outside the sheet as
  removable chips. Tags sort **by usage, not alphabetically**. A hamburger was rejected (implies
  navigation, of which there is none) as was a second FAB (competes with the primary action).

### Ratings — a collapsed mark, and this reverses part of ticket 04

- The catalogue shows the **modal rating over a scope**, with **ties rounding down**. Scope is three
  fixed options — **Everyone / Our house / Me**.
- A per-person picker was built and rejected as faff. That matters, because the picker needed no
  schema and three fixed scopes do: **`household` becomes a real concept** — see
  [ticket 20](20-households.md).
- This **departs from ticket 04's "spread, never collapsed"**: a collapsed mark can hide a lone
  veto, and that was accepted deliberately in exchange for a calm list. Full per-person attribution
  survives on the recipe page. Recorded as an amendment on [ticket 04](04-data-model.md).
- Rejected: **the mean** (the one thing the scale exists to prevent), **the minimum** (a single
  grumpy rating is indistinguishable from household-wide rejection), and **counts** (`✓✓2 ✓1 ✗1` —
  informative, too busy for a list row).

### Scaling — a stepper, and significant figures

- **Servings stepper** (`− 10 +`) where `yield_quantity` parsed; **multiplier buttons** where it
  didn't. Exactly the split the map's fog predicted, now with a working example behind it.
- A **slider was rejected**: it demands drag precision to select a small integer.
- **Significant figures, never snapping.** Snapping each line to a tidy fraction independently
  drifts the *ratios* — at ×1.11 the flour moves and the sugar doesn't, which is a broken cake. A
  fraction is used only where it is **exact**. At ×1 the verbatim text is returned untouched.
- Unit-aware rounding (`1.22 egg` is honest and useless) needs the parsed unit, so it belongs with
  [ticket 10](10-machine-readable-quantities.md), where it has been recorded.

### Tags — earned their place, and are back in scope

Prototyped with faked assignment from a **fixed vocabulary**. Search over the recipe text cannot
answer categorical questions — "veggie" only matches if someone wrote the word — and that gap is
real. Free-form tags drift (veggie/vegetarian/veg), so a closed list the model picks from is the
only version worth having. Modelling and assignment: [ticket 19](19-tags.md).

### Ticket 03's swap test — passes

Two complete skins (`paper` / `slate`) plus light and dark live **only** in `theme.css`: palette,
font, radius *and* density via `--spacing`. No component names a colour. The token architecture is
confirmed by use, not by argument.

### Found while looking at real data

- Panzanella carries a mangled ingredient line — `"2 tablespoons red wine chopped torn croutons
  (page 269)"`, two lines welded together by the extraction. Evidence for ticket 10's prompt work.
- Biome's `noDuplicateCustomProperties` is a **false positive by construction** on the theme file:
  defining a token in `:root` and again in `@theme inline` is exactly what ticket 03 mandates. It
  needs disabling for `theme.css` before the real client is written.
- Five recipes is a thin catalogue. Filters and density will read differently at fifty.
- The catalogue FAB overlaps the last row's rating when the list is short enough not to scroll.

### Assets

The full set of variants is the primary source and belongs on a throwaway `prototype/look-and-feel`
branch — **not yet captured**, as no commit has been made. Everything lives under
`client/src/prototype/` plus `client/prototype.html`, run with `bun run proto`.
