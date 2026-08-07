# An eval harness for extraction quality

Type: task
Status: out-of-scope
Blocked by: 05

**Out of scope for this map.** Measuring extraction quality over time is a build-the-product
concern, not a "does this feel right on my laptop" one. The prototype's ground truth is a human
reading the photo beside the JSON. Carry this ticket into the next map as-is.

## Question

Ticket 05's failure list was produced by a human reading four photos beside four JSON blobs. That
does not scale to the comparisons now queued up: `gpt-4.1` vs `gpt-5` once the org verifies,
prompt A vs prompt B for the description problem, and "did rotating the photo actually fix it?".

Build the smallest thing that answers "did that change make extraction better or worse".

- `evals/<slug>.jpg` plus a hand-written `evals/<slug>.expected.json` per page. The expected file
  is the expensive part and has to be right — it is the only ground truth there will ever be.
- A script (`bun run eval`, not `bun test` — it spends money and isn't deterministic) that
  extracts each photo and grades:
  - **ingredients**: normalise (lowercase, collapse whitespace) and set-diff against expected;
    print *missing* and *extra*. This is what caught the dropped and merged lines in 05.
  - **counts and section titles**: exact match, cheap.
  - **steps and description**: don't diff prose. Assert expected key phrases appear, and assert
    `title` is null where the book has no step title.
- Cache raw responses to disk so re-grading after a grader change costs nothing and only
  re-extraction costs money.

Deliberately not here: an LLM judge. It is another call, another thing to be wrong, and prose
quality is not currently what fails — dropped and invented *facts* are.

Start with the four pages already in `data/photos/` from ticket 05; their sidecar JSON is a
head start on writing the expected files, as long as it's corrected against the photo rather than
trusted.

Done when changing the model or the prompt produces a diff that says which recipes got better and
which got worse.
