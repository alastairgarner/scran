# Migrate the seven existing recipes

Type: task
Status: open
Blocked by: 13, 10

## Question

`data/` holds seven recipes captured by the prototype: rows in a one-table `recipes` schema, photos
on disk, and a sidecar JSON per photo carrying the model and token usage. The photos are the
irreplaceable part and must not be touched.

Each recipe becomes one `recipe` row, one model-authored `recipeVersion`, and one `photo` source.
The sidecar's `model` and usage fold into the version row, and the sidecar is then deleted — ticket
04 killed it as a second source of truth.

The awkward part: those seven versions carry **no machine-readable quantities**, because they
predate ticket 10. They gain them only by re-extraction from the photos — and this is the **one
sanctioned re-extraction in the entire map**, sanctioned solely because nobody has hand-edited any
of them yet. Decide whether to re-extract or to migrate them with null quantities and accept that
seven recipes can't be scaled.

`createdByUserId` is `NOT NULL` on a version, so this runs after an account exists.

**Two directories, and that's deliberate.** Ticket 11's `storage.ts` writes new artifacts to
`DATA_DIR/sources/` keyed by source id, because sources are no longer all photos. The seven
existing files stay in `DATA_DIR/photos/` under their original names. Either teach `storage.ts` to
read a legacy key, or copy the seven across — but never move or rename the originals until the new
copies are verified, and prefer copying to moving throughout.

Done when the seven recipes read correctly in the new schema, their photos are unmoved, and the
old table and sidecars are gone.
