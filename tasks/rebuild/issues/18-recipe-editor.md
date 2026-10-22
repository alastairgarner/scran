# What does fixing a recipe look like?

Type: prototype
Status: resolved
Reviewer: human
Assignee: alastair
Blocked by: 06

## Question

Versioning exists **for this**. The model gets things wrong — a welded ingredient line, a missed
section heading, a quantity it invented — and the whole append-only version story is there so a
person can correct it without destroying what the model produced. Ticket 06 settled every other
screen and deliberately did not touch this one; its questions don't overlap with any of them.

The shape of the surface, given the model is already locked:

- **Inline or a form?** Tapping a line and editing it in place, versus an edit *mode* for the whole
  recipe. An edit appends a version either way, so the question is purely what it feels like — and
  whether a one-word typo fix should cost the same ceremony as a rewrite.
- **What a section heading does when you edit around it.** A `title` rides on the *first line* of a
  group rather than being a container. So: what happens when that line is deleted, reordered, or
  when someone wants a new heading in the middle?
- **`text` is sacred; `quantity`/`unit`/`food` are a best-effort overlay.** Does a person ever edit
  the parsed parts directly, or only the line — with the parse re-derived? Showing both risks
  implying the overlay is the truth. Showing neither means a bad parse can never be fixed, and an
  unscalable line stays unscalable forever.
- **Reordering, adding and deleting lines** — needed at all for a first pass, or is correcting text
  the 95% case?
- **Where the affordance lives.** Ticket 06's recipe screen has no edit button. Adding one costs
  something in a layout that is deliberately quiet.
- **What you see afterwards.** The map says no history UI until someone wrecks a recipe. Does an
  edited recipe show *anything* — "edited by Jo, 3 Aug" — or nothing at all?

Prototype it against the same throwaway harness ticket 06 built (`bun run proto`), with the real
recipes. The mangled Panzanella line is the test case worth designing for.

## Amendment from [ticket 19](19-tags.md)

**Tag correction belongs to this screen**, on the principle that there is one place you go to change
something about a recipe — splitting text-here, tags-there invents a distinction that only exists in
the schema. The tag row in the recipe header stays read-only.

Behind the seam the two saves differ, and the prototype should not pretend otherwise: a text edit
**appends a version**, while tags are a plain write to `recipeTag` and **append nothing**. Ten tags
from a fixed vocabulary, so the control is a checklist, not an input.

## Answer

Validated in variant K of the `prototype/recipe-editor` worktree. The pencil opens a dedicated edit
layout: ingredients first, method second, with each ingredient line and step directly editable in
its own card. Method titles are omitted. A `+` between cards inserts there; each card can be deleted.

Reordering is select, scroll, place — not drag and drop. A compact `Move` button selects the card,
then temporary placement targets appear between cards. This works for long methods without held-edge
scrolling. Ingredient text remains the truth and changing it re-derives the scaling overlay. Tags
stay on the same screen as a fixed checklist but save separately. Done returns to the ordinary recipe
view; no edit metadata or history UI is added. The same editor opened empty covers typed-in recipes.

## Comments

2026-10-22: The recipe actions menu now replaces the proposed pencil as the editor entry point,
per the user's updated UX choice. Its actions are Edit, Read source again, and Delete. Reading
the source again appends a version and preserves prior content on failure. Existing-recipe
editing follows the card and select-scroll-place design; typed-in recipe creation remains separate.
