# Create one recipe from multiple photos

Type: task
Status: resolved
Reviewer: agent

## Scope

User approved implementation: capture sequential camera photos or select multiple library photos when creating one recipe. Review each photo, rotate, replace, remove and reorder with accessible controls. Preserve existing photos on cancellation or invalid replacements. Keep single-photo creation quick.

Extract all ordered photos together into one recipe. Retain original source bytes and per-photo rotation; source viewing, retry and reading again use every source in order. Adding photos to existing recipes is out of scope.

## Validation

Run `bun run check`, `bun test`, affected browser flows in an isolated Docker preview, and independent agent review. Address valid findings and rerun validation. No commit, push, merge or deployment requested.

## Release

User explicitly requested merge and deployment after validation and independent reviews passed. Feature will be committed, integrated into current main, revalidated, pushed and deployed using the repository workflow.

## Press-and-hold follow-up

User requested click-hold to pick up, then drag. Reuse existing dnd-kit: mouse and touch share a 250 ms hold threshold with 8 px pre-activation movement tolerance. Picked-up thumbnails lift slightly, gain shadow and use a grabbing cursor. Normal click still selects; keyboard/non-drag alternatives unchanged.

Validation: `bun run check` and all 119 tests (423 assertions) passed. Real preview at `http://127.0.0.1:32793`: normal click selects, pre-hold movement cancels pickup, stationary hold lifts before any movement, held drag reorders, release resets feedback and Escape cancels without changing order. Emulated touch suite and full phone/desktop regressions passed; desktop retried after preview authentication correctly rate-limited repeated test logins. Independent focused review passed with no actionable findings; reviewer independently ran `bun run check`. Browser interactions were validated by parent, not independently rerun by reviewer.

## Current follow-up

User rejected the initial capture UI as cluttered and requested adopting the shared UI foundations merged in `b059982`. Worktree fast-forwarded to that commit, retaining the uncommitted multi-photo work. Capture now uses shared PageHeader, ButtonLink, Button, Field, Section, Feedback and Dialog patterns. Quiet icon tools, dnd-kit mouse/touch/keyboard thumbnail reordering, on-demand position chooser, add/replace dialog and a single primary extraction action replace the earlier button-heavy UI. No feature commit, push or deployment.

### Follow-up validation

- `bun run check`: passed; `bun test`: 119 passed, 423 assertions.
- Rebuilt Docker preview: `http://127.0.0.1:32792`.
- Real preview API checks at 390×844 and 1280×900 passed mouse drag, keyboard reorder/cancel, non-drag position chooser, rotations, cancelled/invalid/successful replacements, camera/library selection, source-byte/order/angle payloads, failure recovery, single-photo/empty states and `/ui` dialog interactions.
- Emulated touch long-press drag passed; max-count rejection, mixed valid/invalid batch preservation, 10-photo horizontal strip and no page overflow passed.
- Delayed preview validation correctly disables actions without replacing the current set. A long-filename overflow found in browser checks was fixed; retest passed. Dark-mode screenshot checked.
- Fresh slowed mobile/desktop validation recordings saved at `/tmp/scran-multi-browser/foundations-mobile.webm` and `foundations-desktop.webm`.
- Independent review of the full diff against `b059982`: no actionable correctness, accessibility or shared-pattern findings. Reviewer independently passed checks and 119 tests; their browser could not reach the preview, so browser validation above was performed by the parent.
- As before, camera input is automated files rather than physical hardware; final capture requests in browser tests are intercepted, and model responses in backend tests are replaced. No live-model accuracy claim.

Prior validation below describes the superseded UI.

## Prior implementation

## Implementation and validation

- Repeated multipart photos/rotations, shared limits (10 photos, 20 MiB each, 50 MiB total); legacy single-photo and URL requests retained.
- Source IDs allocated in reading order; original bytes and rotations retained. Extraction, retry and reading again send all pages together in one model request.
- Camera/library creation with normalized previews, numbered thumbnails, accessible reorder, rotation, replacement and removal. Batch previews validate before changing the current selection.
- `bun run check`: passed. `bun test`: 112 passed, 0 failed (394 assertions).
- Docker preview `http://127.0.0.1:32783`: Chromium at 390×844 and 1280×900 passed library batch, sequential camera append, rotation persistence, keyboard reorder, cancelled retake, invalid/successful replacement, removal, failed save recovery, original multipart bytes/order/angles, successful navigation, single-photo and empty-state recovery.
- Additional browser checks passed maximum-count rejection, disabled add controls at 10/re-enabled after removal, all-or-nothing mixed valid/invalid batch validation and mobile thumbnail wrapping. No page errors or horizontal overflow.
- Browser checks use the real authenticated preview/normalization API; final capture intercepted to avoid external model calls. Backend integration tests exercise real storage, extraction and retry/reread with only model responses replaced. Native phone camera hardware and live model accuracy not tested.
- Independent read-only review round 1 found a P2 race: ratings/comments created while source files were saving could prevent failed-capture rollback via foreign keys. Fixed rollback to remove all dependent rows and search index data in the same transaction. Regression test injects dependent writes during a later failing save and asserts complete row/file cleanup and original error preservation.
- After the fix, checks/tests and both browser suites passed again against the rebuilt preview. Independent follow-up review passed: no actionable findings in the complete diff; prior P2 confirmed resolved. Reviewer independently reran checks and all 112 tests (394 assertions).

