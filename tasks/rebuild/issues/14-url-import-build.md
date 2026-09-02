# Build URL import

Type: task
Status: resolved
Reviewer: agent
Blocked by: 13

## Question

Decided in principle by charting (store the raw HTML permanently, its own prompt) and unblocked by
ticket 05, which put the seam at `extract(source)`: a URL-sourced recipe is a `source` row with
`kind = 'html'` and everything downstream is identical to a photo.

- Fetching the page, and what happens when the fetch fails, redirects, or returns something that
  isn't HTML. The failure class is `AppError.dependency`, same as a failed extraction.
- Storing the **raw HTML** permanently via `storage`, so re-reading it later stays possible and
  every downstream decision stays reversible.
- The second prompt. Most recipe sites carry JSON-LD `schema.org/Recipe` — is that read directly
  when present and the model used only as a fallback, or is the HTML always handed to the model?
  The first is cheaper and more accurate where it exists; the second is one path instead of two.
- `POST /api/recipes` accepting `{ url }` as an alternative body to the multipart photo.
- A recorded fixture for the suite, the same way ticket 13 records the photo one.

Out of scope here: what a URL-sourced recipe looks like in a photo-shaped UI — that's the UI work
waiting on ticket 06.

Done when pasting a recipe URL produces a `ready` recipe whose source row holds the fetched HTML.

## Answer

Built URL capture through the existing asynchronous extraction path. It stores bounded raw HTML,
pins validated public DNS addresses to prevent SSRF/rebinding, validates redirects and content type,
and classifies upstream failures as retryable dependencies. Model input prefers WP Recipe Maker's
structured card, then Recipe JSON-LD, recipe Microdata/RDFa, article, main and body; raw HTML never
becomes the fallback payload. A separate prompt and recorded webpage result keep tests offline.

Both requested live pages reached `ready`: Tuscan Pasta Salad and Spaghetti alla Puttanesca. Agent
review completed with no findings after iteration. `bun run check` and all 69 tests pass. Broader
format research is parked as [enhancement 03](../../enhancements/issues/03-recipe-website-formats.md).
