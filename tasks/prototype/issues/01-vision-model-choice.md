# Which vision LLM for cookbook-photo recipe extraction?

Type: research
Status: resolved

## Question

Pick the provider and model the prototype calls when it gets a photo of a cookbook page.

What to find out:

- What Mealie actually recommends and defaults to for its image-import feature, and why
  (see its AI-providers docs and `mealie/services/openai/`). Mealie's docs call out that the
  model must be image-capable and name a specific default — find the current one.
- Which current vision models handle the real failure cases here: a phone photo of a glossy
  cookbook page, shot at an angle, with a curved spine, mixed columns, and a photo of the
  finished dish taking half the page.
- Whether a separate OCR pass (Tesseract, a cloud OCR API) before the LLM meaningfully beats
  handing the raw image to a multimodal model. Mealie does OCR + AI; find out if that's still
  the right shape or a legacy of when vision models were worse.
- Structured-output support: which providers can be forced to return a typed recipe object
  (tool use / JSON schema / structured outputs) so there's no parsing step.
- Rough cost per extraction, and whether a local Ollama vision model is remotely viable on a
  laptop for this specific task.

Answer with a recommended provider + model, the API shape to call it with, and what it costs.

## Answer

**OpenAI `gpt-5`, one multimodal call, structured outputs, no OCR stage.**

Full research: [`../research/01-vision-model-choice.md`](../research/01-vision-model-choice.md).

**There is no OCR step to build.** Mealie doesn't do OCR either — no `pytesseract` in its deps,
zero `tesseract` hits in the repo; the "OCR and AI" line in its docs is stale, and the OCR column
in its DB is a 2022 fossil. More importantly, a pre-OCR pass is actively *harmful* for our inputs:
on re-photographed pages (warp, skew, glare), pipeline OCR collapses — PP-StructureV3 scores 84.7
on flatbed scans and **38.0** on angled capture — while VLMs hold ~89. The model reads the image
directly, using layout and language context rather than per-glyph shape matching, which is why it
survives a curved spine and a two-column page.

Failure mode moves accordingly: bad OCR gives visible garbage characters; a VLM gives fluent,
plausible, *wrong* text. Ticket 05 tests against real books for exactly this reason.

**Why OpenAI over the benchmark winner.** Research recommended Gemini `gemini-3.1-pro-preview`
on measured evidence (89.2 on Real5-OmniDocBench, the best-measured frontier closed model —
though Claude and GPT weren't evaluated, so it's evidence, not a full ranking). Overridden
deliberately: I already have an OpenAI relationship, `gpt-5` is what Mealie's docs recommend for
image import, and Mealie's prompt — which ticket 02 lifts — is written against it. Structured
output is table stakes across all providers, so switching later is a few lines. Gemini stays the
runner-up if extraction quality disappoints on real books.

Cost reference point: Gemini Pro was ~2.5¢/extraction (~75¢ for 30 recipes). Confirm OpenAI's
actual per-extraction cost once the first real photos go through — it's the number that decides
whether a cheaper model is worth stepping down to.

Shape of the call: image as base64, a system prompt, and a JSON schema for the recipe type so a
typed object comes back with no parsing step. Parse-and-validate anyway — schema-constrained
decoding guarantees valid JSON, not correct values. No image preprocessing, no retry loop, no
second call; if it comes back wrong the fix is the prompt or the schema, not another stage.
Multi-image is the same call with more image parts — relevant to the deferred multi-photo fog.
