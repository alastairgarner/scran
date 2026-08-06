# Which vision LLM for cookbook-photo recipe extraction?

Type: research
Status: open

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
