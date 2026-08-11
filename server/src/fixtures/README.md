# Recorded model responses

`extractions.json` is four real `gpt-5` replies to the four distinct prototype
photos in `data/photos/`, captured on the schema and prompt ticket 10 settled.
Keyed by photo filename; each entry is `{ model, usage, recipe }` — exactly what
`extractRecipe` returns.

They exist so the test suite never makes a live call. Ticket 05 put the LLM seam
on a defaulted parameter, so a test hands `extract` a function that returns one
of these and needs no mocking framework.

**Regenerate them whenever the prompt or the response schema changes**, and read
the diff before committing it — a fixture recorded against an older prompt is a
test that passes while the real thing is broken.
