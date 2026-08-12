# Recorded model responses

`extractions.json` is four real `gpt-4.1` replies to the four distinct prototype
photos in `data/photos/`, captured on the schema and prompt ticket 10 settled.
Keyed by photo filename; each entry is `{ model, usage, recipe }`, where `recipe`
is the model's reply as OpenAI returned it.

They exist so the test suite never makes a live call. Ticket 05 put the LLM seam
on a defaulted parameter, so `testing.ts`'s `recordedComplete` hands `extract` a
`Complete` that replays one of these, and needs no mocking framework. A test that
drives capture through HTTP has no parameter to pass, so `withoutOpenAI` replaces
`fetch` with the same recorded body for the duration instead.

One test parses all four through `extractionSchema`, so a fixture that no longer
matches the schema fails loudly rather than quietly.

**Regenerate them whenever the prompt or the response schema changes**, and read
the diff before committing it — a fixture recorded against an older prompt is a
test that passes while the real thing is broken.
