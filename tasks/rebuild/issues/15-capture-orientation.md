# Fix capture orientation

Type: task
Status: open
Blocked by: 13

## Question

The prototype's worst result by a distance was a cookbook page photographed 90° rotated — the model
produced nonsense from a perfectly legible page. Cheap to fix, and it belongs to the extraction
module's new shape.

Three candidate fixes, and they aren't exclusive:

- **Honour EXIF orientation** before the image reaches the model. Phone cameras write the rotation
  as a tag rather than rotating the pixels, so this may be the whole bug.
- **Rotate client-side before upload** — a canvas draw, which also shrinks the file.
- **Tell the model** the image may be rotated, in the prompt.

Whichever wins, the stored photo is the irreplaceable artifact: decide explicitly whether the
rotation is applied to the bytes on disk or only to the copy sent to the model.

Done when a deliberately rotated photo of a page extracts as well as the upright one.

## Amendment from [ticket 10](10-machine-readable-quantities.md)

**Rotation is not the only layout the model can't read.** Four re-extractions of the Panzanella
photo — a two-column magazine spread — produced four different ingredient lists: once with two
lines welded into one, once with two ingredients that are not on the page, and twice correctly.
Adding "read each column to its end before starting the next" to the prompt helped and did not
settle it.

So this ticket is really **"the model can't see the page properly"**, of which rotation is the
cheap case. Whatever the fix is, judge it against the Panzanella photo as well as the rotated one,
and treat a stable result across repeated runs as the bar — a single good extraction proves nothing
here.

Ticket 10 then narrowed it further by experiment: at `temperature: 0` every *derived* field on that
photo went perfectly stable across repeats (count, yield, time, tags) while the verbatim ingredient
text kept changing. Sampling was therefore never the cause — the model reads the page differently
each time. **The fix is preprocessing** (crop, deskew, resolution, or splitting the columns before
the call), not prompt wording and not decoding parameters. Both are already ruled out by evidence.

## Comments

2026-10-21: Live phone testing reproduced the rotation failure on a page of smashed
potatoes. GPT-4.1 at temperature zero read 11 ingredient lines from the sideways
photo, with missing ingredients and wrong quantities. A 90° counterclockwise
rotation of the decoded pixels, saved as PNG, recovered all 13 ingredient lines
and the important method details in one trial. The photo's EXIF orientation is 1,
so metadata alone would not have corrected it. This is evidence for explicit user
confirmation, not proof of stability across repeated extractions.

The user approved a capture preview with rotation controls and an explanation of
why orientation matters. Capture now waits for “Extract recipe”; the preview says
“Make sure the text is upright. Sideways pages can lead to missing ingredients or
incorrect quantities.” It offers clockwise 90° rotation and retaking the photo.
The server keeps the original source bytes, stores the selected rotation on the
source, and applies EXIF orientation followed by that rotation to a PNG copy for
the model. Retries use the same saved angle. A session-protected preview endpoint
normalizes EXIF and returns a reduced PNG without storing it or creating a recipe.
This avoids a Chromium/WebKit discrepancy found with PNG orientation metadata.
No resolution reduction is applied to the extraction input.

Tests cover four rotations, EXIF rotation/mirroring, retained source bytes and
rotation across a failed extraction, and rejected invalid angles. The broader
multi-column/Panzanella acceptance remains open; this change addresses rotation.

Validation: `bun run check` and 86 tests passed. Headless Playwright in Chromium
and WebKit passed the mobile flow against the real preview API: all four angles,
EXIF plus manual rotation, original upload bytes, errors, retaking, and no horizontal
overflow. Final capture requests were intercepted to avoid live model calls.
