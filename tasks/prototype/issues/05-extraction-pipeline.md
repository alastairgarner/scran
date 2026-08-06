# Photo in, structured recipe out

Type: task
Status: resolved
Blocked by: 01, 02, 03, 04

## Question

The core of the prototype, and the thing worth feeling early: upload a photo, get a recipe back.

- An endpoint that accepts an image upload
- Calls the model chosen in ticket 01, using the prompt from ticket 02 as a starting point
- Returns whatever JSON the model produced, stored verbatim (ticket 03 — there is no schema to
  validate against, and deliberately so). Save the photo alongside it; that's the one piece of
  data that can't be regenerated.
- The API key comes from the environment

Then test it against real books off my own shelf, not clean screenshots. Note where it fails —
that failure list is what tells the map whether multi-photo capture and a hand-edit path need
to graduate out of the fog.

Keep the errors visible rather than handled. Knowing how it breaks is the point.

## Answer

Built and run against four real pages. `POST /api/extract` takes a multipart `photo`, writes it to
`data/photos/` **first**, makes one multimodal call, and returns the model's JSON untouched.

- `server/src/extract.ts` — one `fetch` to `/v1/chat/completions`, image inlined as base64,
  `response_format: json_schema` (strict). No SDK: the call is twenty lines and the dependency
  buys nothing. Model is `OPENAI_MODEL`, defaulting to `gpt-5`.
- `server/src/prompts/parse-recipe-image.txt` — Mealie's prompt, minus its translation paragraph.
  As ticket 02 found, the extraction rules live in the response schema's field descriptions, not
  the prompt.
- Schema is Mealie's image schema near-verbatim: `{title, text}` items for ingredients,
  instructions and notes. Ingredients stay whole lines — ticket 03 killed the structured model.
- Every run also writes `<photo>.json` beside the photo: `{photoPath, extractedAt, model, recipe,
  usage}`. Not SQLite (ticket 06 owns the catalogue), but comparing two models or two prompts is
  impossible if the runs are only ever printed to a terminal.
- Errors surface raw, message and stack, per the ticket.

**Not run on `gpt-5`.** The OpenAI org isn't ID-verified, so `gpt-5` 403s on inference even though
it lists in `/v1/models`. Everything below is `gpt-4.1`. The default stays `gpt-5`; re-run when
verification lands.

### Cost

~2,000 prompt + ~400–800 completion tokens per page → **~$0.01 per extraction** on `gpt-4.1`,
3–7 seconds. Cheap enough that the cost question is closed for the prototype.

One number worth keeping: `gpt-4o-mini` billed **48,740** prompt tokens for the same photo that
`gpt-4.1` billed 2,016 for — a 24× difference in image tokenisation, which made the "cheap" model
the expensive one. Per-model image tokenisation matters more than the headline per-token price.

### The failure list

Four pages: a glossy two-column cookbook page, a three-column page with a headnote, a 1980s
handwritten recipe card, and a page shot 90° rotated.

1. **Rotated pages collapse.** The rotated page was by far the worst result: salami, red onion,
   chile flakes and croutons dropped entirely; "2 tablespoons red wine vinegar" and "2 recipes
   torn croutons" merged into one nonsense line; the oregano, savory and mint lines fused; a page
   cross-reference changed from 29 to 269; `Serves 4` missed despite being in the margin.
2. **Confident fabrication in prose fields.** The same page's sidebar came back as invented pepper
   trivia. Smaller substitutions survive in otherwise-correct steps: "butter or **olive oil** as
   needed" became "butter or **basil leaves**"; "Tangle into **4** bowls" lost its 4. Exactly the
   failure mode ticket 01 predicted — fluent, plausible, wrong.
3. **`description` is always model-authored.** Every page: the author's headnote is discarded and
   replaced with a generic summary, even though the text is right there on the page.
4. **Step titles inconsistent.** One page had four titled steps; the first came back `null`, the
   other three correct.
5. **Handwriting reads well; attachment doesn't.** The handwritten card was the pleasant surprise
   — annotations, substitutions and the marginal notes all captured. But an annotation sitting
   beside *chocolate chips* was attached to *baking powder*, and "9 large muffins" with a
   handwritten "10" beneath became an invented "9-10" range.

`gpt-4.1` fixed three of four failures `gpt-4o-mini` had on the same page (a dropped ingredient,
two merged ingredients, invented step titles, and the ignored section-title sentinel). Those were
model-capability failures, not prompt bugs — worth knowing before tuning a prompt against them.

### What this tells the map

- **Multi-photo capture stays in the fog.** Single-page extraction is not the bottleneck; nothing
  here failed for want of a second photo.
- **Capture orientation graduates instead.** Rotation caused the single worst result and is nearly
  free to fix (rotate before upload, or honour EXIF).
- **A hand-edit path graduates.** Failures 2 and 5 are undetectable without the photo beside you,
  which makes "see the photo, fix the text" the cheapest correction surface.
- The *description-always-rewritten* problem (3) is the one failure that looks like a prompt bug
  rather than a model limit — the cheapest next experiment.
