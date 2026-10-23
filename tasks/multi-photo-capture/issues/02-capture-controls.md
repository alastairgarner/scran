# Refine photo ordering and rotation

Type: task
Status: resolved
Reviewer: agent

## Scope

User feedback after release: constrain photo dragging to horizontal movement, prevent vertical strip/page scrolling and clipping during drag. Add separate, recognisable rotate-left and rotate-right icons. Remove the three-dot order dialog; retain keyboard drag-and-drop and announcements.

## Validation

Run checks/tests plus real preview regression at phone/desktop widths: deliberately drag vertically, reorder a long strip with horizontal edge scrolling, mouse/touch/keyboard operation, left/right rotations and saved angles. Independent review. User explicitly approved merge and deployment after validation and independent review passed.

## Implementation and validation

- Official dnd-kit horizontal-axis and first-scrollable-ancestor modifiers constrain tiles to the strip. Auto-scroll is limited to the strip; vertical overflow is hidden. Horizontal edge scrolling still works for long photo sets.
- Separate left/right rotation controls with mirrored circular arrows around a photo glyph, accessible names and tooltips. Removed the position dialog, its state, three-dot icon and obsolete screen-reader instructions. Keyboard drag/reordering stays.
- `bun run check`: passed; `bun test`: 119 passed, 423 assertions.
- Preview `http://127.0.0.1:32794`: deliberate vertical mouse and emulated-touch drags keep tile Y fixed, strip scrollTop at zero and document scrollY unchanged. Ten-photo horizontal edge autoscroll/reordering, keyboard drag and desktop vertical lock passed.
- Rotation browser checks covered left/right, full turns, inverses, persistence across photo selection, and original multipart files with per-photo angles 270/90. No order menu remains.
- Full phone/desktop creation regressions and shared `/ui` dialog checks passed, including cancellation, invalid/successful replacement, error recovery, original bytes/order/angles, single-photo/empty states, delayed loading and long filename wrapping.
- Independent review passed with no actionable standards or spec/correctness findings. Reviewer independently ran `bun run check` and `git diff --check`, and inspected phone/desktop screenshots; interaction tests were performed by parent. Physical phone hardware/live extraction not tested; browser capture submissions intercepted as in the original feature validation.
