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
