# Build recipe editing

Type: task
Status: open
Reviewer: agent
Blocked by: 21

## Outcome

A person can correct recipe content and tags from the dedicated editor settled by
[ticket 18](18-recipe-editor.md). Content edits append a version; tag edits update the recipe
without creating one.

## Acceptance criteria

- [ ] The recipe screen's pencil opens the card editor from ticket 18.
- [ ] Ingredient lines and instructions can be edited, inserted, deleted and reordered.
- [ ] Saving content appends a person-authored version and preserves the previous version.
- [ ] Tags can be corrected from the fixed vocabulary without appending a version.
- [ ] A typed-in recipe can be created through the same editor empty.
- [ ] Relevant tests and `bun run check` pass.

## Constraints

- Ingredient `text` remains the truth; changing it re-derives its scaling overlay.
- No history UI or edit metadata.
- Use ticket 18's select-scroll-place interaction; no drag-and-drop.

## Starting points

- [Editor design](18-recipe-editor.md)
- [Architecture](05-architecture.md)
- [Recipes module](13-recipes-and-extraction-build.md)
- `client/src/`
- `server/src/recipes.ts`
- `server/src/http/recipes.ts`
