# Which vision LLM for cookbook-photo recipe extraction?

Research for [issue 01](../issues/01-vision-model-choice.md). Researched 2026-08-06.

## TL;DR

- Mealie no longer does OCR. Its image import is **one multimodal call, no OCR pass**, using OpenAI
  structured outputs against a Pydantic recipe model. Docs recommend `gpt-5`.
- A separate OCR pass is now **actively worse** on exactly our inputs. On the one benchmark that
  physically reconstructs warped/skewed/glare-lit handheld photos of pages, pipeline OCR tools drop
  to 38–66 while VLMs stay at 88–92.
- Every serious provider can return a typed object with no parsing step. So can Ollama.
- Cost per extraction is between a fifth of a cent and seven cents. At prototype volume this is
  not a decision input.
- **Recommendation: Google Gemini, `gemini-3.1-pro-preview`, single `generateContent` call with
  `responseJsonSchema`.** ~2–3¢ per extraction. See [RECOMMENDATION](#recommendation).

---

## 1. What Mealie actually does

### Docs

Mealie's AI-providers page ([docs.mealie.io](https://docs.mealie.io/documentation/getting-started/installation/ai-providers/),
[source](https://raw.githubusercontent.com/mealie-recipes/mealie/mealie-next/docs/docs/documentation/getting-started/installation/ai-providers.md)):

> To enable image recognition features, such as creating a recipe from an image, configure a
> provider capable of image recognition (e.g. `gpt-5`)

> For most users, choosing an OpenAI model (such as `gpt-5`) and supplying the OpenAI API key is
> all you need to do.

Mealie works with "any OpenAI-compatible API" and names Ollama (`base_url` →
`http://localhost:11434/v1`) as the self-hosted alternative. It has no first-class Anthropic or
Gemini support — everything goes through the `openai` Python SDK.

Configuration moved from env vars to a DB-backed per-group provider table in the
[2026-05-18 migration](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/alembic/versions/2026-05-18-16.27.05_2187537c52b8_add_table_for_ai_providers.py),
which carries the old default forward: `OPENAI_MODEL: str = "gpt-4o"`. There are now **three
separate provider slots** — default, image, audio — so you can point image import at a different
model than chat.

### Code

[`mealie/services/openai/openai.py`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/openai/openai.py):

- `OpenAILocalImage.get_image_url()` minifies the upload to JPEG via Pillow and inlines it as a
  `data:image/jpeg;base64,...` URL in an `image_url` content part. No preprocessing beyond
  format conversion — no deskew, no binarisation, no OCR.
- `_get_raw_response()` calls `client.chat.completions.parse(...)` with
  `response_format=response_schema`, i.e. **OpenAI structured outputs against a Pydantic model**.
  The recipe comes back typed.
- `_get_provider()` routes by attachment type: an image attachment selects the image provider.

[`mealie/services/recipe/recipe_service.py`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/recipe/recipe_service.py)
passes a **list** of `OpenAILocalImage` with `response_schema=OpenAIRecipe` and the message
`"Please extract the recipe from the images provided. There should be exactly one recipe."` —
multi-image, one recipe, one call.

The prompt
([`prompts/recipes/parse-recipe-image.txt`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/openai/prompts/recipes/parse-recipe-image.txt))
is four sentences and worth stealing wholesale:

> You are a bot that reads an image, or a set of images, and parses it into recipe JSON. You will
> receive an image from the user and you need to extract the recipe data. It is imperative that
> you do not create any data or otherwise make up any information.
>
> The user message that you receive will be one or more images. Assume all images provided belong
> to a single recipe, not multiple recipes. The recipe may consist of printed text or handwritten
> text. It may be rotated or not properly cropped. It is your job to figure out which part of the
> image is the important content and extract it.

### The OCR question, answered by Mealie's dependency list

`mealie/pyproject.toml` (v3.22.0) has **no `pytesseract`, no `tesseract`, no OCR library at all**.
A repo-wide code search for `tesseract` returns zero hits. What remains is fossils:

- `is_ocr_recipe` boolean column on `recipes`, added by a
  [2022 migration](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/alembic/versions/2022-08-13-17.07.07_089bfa50d0ed_add_is_ocr_recipe_column_to_recipes.py)
  and never removed.
- `loading-ocr-data` translation strings in every locale file.
- One stale docs line in `docs/docs/documentation/getting-started/features.md`: *"Upload an image
  of a written or typed recipe and Mealie will use OCR and AI to import it."*

The Tesseract-based OCR feature was removed and replaced by the AI import — users complained about
it in the [October 2024 survey](https://github.com/mealie-recipes/mealie/blob/mealie-next/docs/docs/news/surveys/2024-october/q12.md):
*"I sure miss the native recipe OCR functionality... The AI implementation was both complicated to
set up and didn't work."*

**So: "Mealie does OCR + AI" is out of date.** It does AI only. The premise in the ticket is a
legacy of the pre-v1.7 feature.

---

## 2. Which models survive real cookbook photos

The generic OCR leaderboards are the wrong benchmark — they score clean scans and PDFs, where
everything is ≥90 and the differences are noise. What matters here is the physical-world subset.

### Real5-OmniDocBench — the directly relevant benchmark

[Real5-OmniDocBench](https://arxiv.org/abs/2603.04205)
([HTML](https://arxiv.org/html/2603.04205v1),
[dataset](https://huggingface.co/datasets/PaddlePaddle/Real5-OmniDocBench)) physically
re-photographs all 1,355 OmniDocBench v1.5 pages across five conditions. Four of the five are
literally our failure cases, and all non-scan images were **captured by hand with mobile devices**:

| Condition | What it is | Our case |
|---|---|---|
| Warping | page curvature from book spines / folding | curved spine ✅ |
| Illumination | shadows and glare | glossy page ✅ |
| Skew | 3D perspective distortion from angled capture | shot at an angle ✅ |
| Screen-Photography | moiré and reflections | — |
| Scanning | flatbed baseline | — |

Results (higher is better):

| Model | Overall | Scanning | Warping | Screen-Photo | Illumination | Skew |
|---|---|---|---|---|---|---|
| PaddleOCR-VL-1.5 (0.9B, specialist) | **92.05** | 93.43 | **91.25** | 91.76 | 92.16 | **91.66** |
| Gemini 3 Pro | 89.24 | 89.47 | 88.90 | 88.86 | **89.53** | 89.45 |
| Qwen3-VL-235B | 88.90 | 89.43 | 89.99 | 89.27 | 89.27 | 86.56 |
| Gemini 2.5 Pro | 88.21 | — | — | — | — | — |
| PP-StructureV3 (pipeline OCR) | 64.45 | 84.68 | 59.34 | 66.89 | 73.38 | **37.98** |
| Marker 1.8.2 (pipeline OCR) | 60.10 | — | — | — | — | — |

Three things fall out of this:

1. **Pipeline OCR collapses on exactly our inputs.** PP-StructureV3 goes 84.68 → 37.98 from
   flatbed to angled handheld. VLMs move by ~1 point across the same gap.
2. **Skew is the hardest condition**, not warping. Angled capture compresses text lines and
   converges them; that breaks line-detection-based pipelines outright, and dents even large
   generalist VLMs.
3. **Scale doesn't buy robustness.** Qwen3-VL-235B has 261× the parameters of PaddleOCR-VL-1.5 and
   loses to it on every condition. The paper's conclusion: *"compact, domain-specialized VLMs
   consistently outperform much larger generalist models under physical stress."*

**Caveat, and it matters:** the closed-model column is Gemini-only. Claude and GPT were not
evaluated. So this benchmark tells us Gemini 3 Pro is the best-measured *frontier generalist* on
physically distorted page photos; it does not tell us Claude or GPT are worse. Treat the Gemini
number as evidence, not as a ranking of all closed models.

### Generic OCR rankings, for context

OmniDocBench (clean, ~April 2026) has GLM-OCR at 94.62, Gemini 3.1 Pro at 90.33, Claude Opus 4.6 at
87.1 ([ofox.ai roundup](https://ofox.ai/blog/best-ai-model-for-ocr-2026/)). The same roundup's
summary — Gemini 3.1 Pro best frontier model for volume document processing, Claude Opus 4.6 best
on complex structured extraction — is directionally useful but these are aggregator numbers, not
primary sources. The DeltOCR results reported there give GPT-5 the edge on handwriting.

The half-page dish photo is a non-issue for any current VLM: it's a segmentation/attention problem
that layout-aware models handle natively, and Mealie's prompt already covers it ("figure out which
part of the image is the important content"). Multi-column is likewise standard — it is what
OmniDocBench's core reading-order metric measures, and every VLM in the table above is ≥86.

---

## 3. Is a separate OCR pass worth it?

**No. Skip it.**

The Real5 numbers above are the direct answer: on handheld photos of curved and angled pages, a
Tesseract/PP-Structure-style pass would hand the LLM *worse* text than the LLM can read itself, and
would destroy the layout signal (which line belongs to which column, which text is a caption) that
the VLM uses to get reading order right. Marker at 60.10 and PP-StructureV3 at 64.45 vs Gemini 3
Pro at 89.24 is not a close call.

The industry position is more nuanced but doesn't change the conclusion for us:

- The hybrid case (OCR for text, LLM for field identification) still exists for narrow, repetitive,
  high-volume forms with stable layouts, and for cost at scale
  ([Vellum](https://www.vellum.ai/blog/document-data-extraction-llms-vs-ocrs),
  [Parsli](https://parsli.co/blog/llm-ocr-vs-traditional-ocr)).
- Traditional OCR "often breaks when layouts change, tables span pages, or documents mix text with
  charts, images, handwriting, and nested structures" — a cookbook page is all of those at once.
- The known LLM-only weakness is field *association* on repeating structures (the cited example:
  mixing up which description belongs to which job on a CV). The recipe analogue is ingredient
  quantities drifting between lines. That is a prompt/schema problem, not an OCR problem.

Where a specialist model *does* earn its place is as a **replacement** for the frontier VLM, not as
a pre-pass: PaddleOCR-VL-1.5 tops the physical benchmark at 0.9B parameters. But it returns
markdown, not a typed recipe — you'd still need a second LLM call to structure it. That's two
moving parts for a prototype where one works. Note it as the upgrade path if the frontier model
proves flaky on real books.

**Mealie's shape is current best practice; the ticket's "Mealie does OCR + AI" premise is stale.**

---

## 4. Structured output support

All four candidate stacks can return a typed recipe with no parsing step.

| Provider | Mechanism | Guarantee | TS ergonomics |
|---|---|---|---|
| **Google Gemini** | `config.responseMimeType: "application/json"` + `config.responseJsonSchema` on `models.generateContent`; or `response_format: {type, mime_type, schema}` on the newer `client.interactions.create` | Constrained decoding — **syntactically** guaranteed. Docs are explicit that values are not semantically guaranteed: *"always validate values in your application"* | Plain JSON Schema object; Zod → JSON Schema is a one-liner. [docs](https://ai.google.dev/gemini-api/docs/structured-output) |
| **Anthropic** | `output_config: {format: {type: "json_schema", schema}}`, or `client.messages.parse()` with `zodOutputFormat(Schema)` → typed `response.parsed_output` | Schema-enforced. Incompatible with citations. First request pays a schema-compilation cost, then 24h cached | Best of the four: Zod in, validated typed object out, no `JSON.parse` anywhere |
| **OpenAI** | `client.chat.completions.parse(response_format=Model)` (what Mealie uses), plus `strict: true` on tool definitions | Strict structured outputs | Zod helpers in the Node SDK |
| **Ollama** | `format` parameter takes a JSON Schema | Constrained decoding, enforced at the sampler — *"malformed JSON mechanically impossible"*. Works with vision models. [docs](https://docs.ollama.com/capabilities/structured-outputs), [blog](https://ollama.com/blog/structured-outputs) | `format:` accepts `zodToJsonSchema(Schema)` |

So structured output is **not a differentiator** — it's table stakes in Aug 2026. Pick on
robustness and cost, then use whatever the chosen provider's typed path is.

One caveat worth carrying into the schema ticket: none of these guarantee *semantic* correctness.
A `{quantity, unit, food, note}` ingredient can come back schema-valid and wrong. Validation stays
our job.

---

## 5. Cost per extraction

Assumptions for the numbers below: one phone photo of one cookbook page; ~1,100–4,800 image tokens
depending on the provider's tiling rules; ~400-token prompt; ~800-token recipe JSON out, plus
~500–1,200 thinking tokens on thinking-by-default models.

Image tokenisation differs meaningfully:

- **Gemini 3**: 258 tokens if both dimensions ≤384px; otherwise tiled into 768×768 tiles at 258
  tokens each, with crop unit ≈ `floor(min(w,h)/1.5)`. A 3024×4032 phone photo → ~4 tiles →
  ~1,000 tokens. `media_resolution` caps the per-image token budget.
  ([docs](https://ai.google.dev/gemini-api/docs/image-understanding))
- **Anthropic**: high-resolution tier on Opus 4.7+ / Opus 5 / Sonnet 5 — up to 2576px on the long
  edge and **up to ~4,784 tokens per image**, ~3× the older 1,568px/~1,600-token tier. Coordinates
  map 1:1 to pixels. Haiku 4.5 is on the old tier.

| Provider / model | $/M in | $/M out | ~$/extraction |
|---|---|---|---|
| Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`) | 0.30 | 2.50 | **~$0.004** |
| Gemini 3.6 Flash (`gemini-3.6-flash`) | 1.50 | 7.50 | **~$0.014** |
| Gemini 3.1 Pro (`gemini-3.1-pro-preview`) | 2.00 | 12.00 | **~$0.025** |
| Claude Haiku 4.5 (`claude-haiku-4-5`) | 1.00 | 5.00 | **~$0.007** |
| Claude Sonnet 5 (`claude-sonnet-5`) | 3.00 (intro 2.00 to 2026-08-31) | 15.00 (intro 10.00) | **~$0.04** |
| Claude Opus 5 (`claude-opus-5`) | 5.00 | 25.00 | **~$0.07** |
| GPT-5.6-luna (`gpt-5.6-luna`) | 0.20 | 1.20 | **~$0.003** |
| GPT-5.4 (`gpt-5.4`) | 2.50 | 15.00 | **~$0.035** |

Sources: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing),
[OpenAI pricing](https://developers.openai.com/api/docs/pricing), Anthropic pricing per the
`claude-api` skill's cached model table (2026-06-24) — cross-check against
[platform.claude.com/docs/en/pricing](https://platform.claude.com/docs/en/pricing) before relying
on it.

**At prototype scale this is noise.** Photographing 30 recipes costs 12¢ on the most expensive
option in the table and under 1¢ on the cheapest. Cost should not drive this decision; it becomes
relevant only if scran ever ingests hundreds of pages, at which point batch pricing (50% off on
every provider) and a Flash-tier model apply.

---

## 6. Is a local Ollama vision model viable?

**Technically yes, practically not for the prototype default.**

- **Qwen3-VL** is the open-weight state of the art. Qwen3-VL-8B-Instruct is described as the
  current SOTA among open-weight VLMs; OCR covers 32 languages, up from 10 in Qwen2.5-VL.
  ([OCR capability docs](https://qwenlm-qwen3-vl.mintlify.app/capabilities/ocr),
  [technical report](https://arxiv.org/pdf/2511.21631))
- **Hardware**: `qwen3-vl:8b` is the sensible default with ≥12GB VRAM/unified memory; `qwen3-vl:4b`
  for tighter budgets and still clearly better than 2B on document accuracy; `qwen3-vl:2b` only for
  8GB machines. MLX builds exist for Apple Silicon.
  ([4B vs 8B guide](https://codersera.com/blog/qwen3-vl-4b-vs-qwen3-vl-8b-benchmarks-vram-guide/),
  [local model roundup](https://www.promptquorum.com/power-local-llm/local-vision-models-llava-ollama-2026))
- **Real-world report**: usable OCR of typewritten documents at 600dpi with `qwen3-vl:8b` on a
  Ryzen 7 / 16GB laptop.
  ([The Autodidacts](https://www.autodidacts.io/ocr-typewritten-manuscripts-with-local-ollama-vision-model/))
- **Structured output works** — Ollama's `format` parameter constrains decoding to a JSON Schema
  and is documented as working with vision models.

The catch: that 600dpi typewritten-document result is the *easy* case. Real5 shows even
Qwen3-VL-**235B** dropping to 86.56 on skew — the local 8B is far below that, and skew is precisely
what a handheld cookbook photo produces. You'd be debugging model capability at the same time as
debugging your own pipeline, which is the wrong thing to do in a prototype whose point is the
pipeline.

Verdict: keep it as a documented escape hatch. Because Ollama exposes an OpenAI-compatible endpoint
at `http://localhost:11434/v1`, swapping to it later is a base-URL change if you build against an
OpenAI-shaped client — but that's the wrong tail wagging the dog for now. Revisit if API cost or
privacy ever becomes a real constraint (neither is, at 30 recipes).

---

## RECOMMENDATION

### Provider + model

**Google Gemini, `gemini-3.1-pro-preview`.**

Why:

1. It is the **only frontier closed model with published results on photographs of physically
   distorted pages** — 89.24 overall, 88.90 warping, 89.45 skew, 89.53 illumination on
   Real5-OmniDocBench. Those are our four failure cases and it is the measured winner among
   general-purpose closed models.
2. One call, no OCR pass, no second structuring step.
3. `responseJsonSchema` gives a typed recipe with no parsing.
4. ~2–3¢ per extraction — irrelevant at prototype volume, cheap enough to stay irrelevant later.

**Step down to `gemini-3.6-flash` (~1.4¢) once quality is proven on real books.** Flash was not
benchmarked, so don't start there — start with the model that has evidence behind it, then trade
down. Same SDK, same schema, one-word change.

Two named fallbacks, in order:

- **If Gemini fumbles a specific book**: try `claude-opus-5` with `messages.parse()` + Zod — the
  best TS structured-output ergonomics of any provider, and the aggregator benchmarks put Claude
  ahead on complex structured extraction, just unmeasured on physical distortion.
- **If frontier models prove flaky on curved spines generally**: PaddleOCR-VL-1.5 (92.05, 0.9B)
  beats everything on physical stress, but it returns markdown → you'd need a second cheap LLM call
  to structure it. Two moving parts; only worth it if one isn't enough.

Do **not** add Tesseract or any OCR pre-pass. That is the one option the evidence rules out.

### API shape

`models.generateContent`, one user turn, `inlineData` base64 JPEG + text prompt, config carrying
`responseMimeType: "application/json"` and `responseJsonSchema`. Steal Mealie's prompt verbatim.

Gemini also has a newer `client.interactions.create` surface with
`response_format: {type: 'text', mime_type: 'application/json', schema}` — same capability, but
`generateContent` is the better-documented path for inline images. Use `generateContent`.

### Code sketch (Bun / TypeScript / Hono)

```ts
// server/src/extract.ts
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const ai = new GoogleGenAI({ apiKey: Bun.env.GEMINI_API_KEY! });

// Mealie-shaped structured ingredients. See the schema ticket for the real thing.
const Recipe = z.object({
  name: z.string(),
  description: z.string(),
  yield: z.string(),
  totalTime: z.string(),
  ingredients: z.array(
    z.object({
      quantity: z.number().nullable(),
      unit: z.string().nullable(),
      food: z.string(),
      note: z.string().nullable(),
    }),
  ),
  instructions: z.array(z.object({ text: z.string() })),
});
export type Recipe = z.infer<typeof Recipe>;

// Verbatim from mealie/services/openai/prompts/recipes/parse-recipe-image.txt
const PROMPT = `You are a bot that reads an image, or a set of images, and parses it into recipe JSON. \
You will receive an image from the user and you need to extract the recipe data. It is imperative that \
you do not create any data or otherwise make up any information.

The user message that you receive will be one or more images. Assume all images provided belong to a \
single recipe, not multiple recipes. The recipe may consist of printed text or handwritten text. It may \
be rotated or not properly cropped. It is your job to figure out which part of the image is the \
important content and extract it.`;

export async function extractRecipe(jpeg: ArrayBuffer): Promise<Recipe> {
  const res = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [
      {
        role: "user",
        parts: [
          { text: "Extract the recipe from the image provided. There should be exactly one recipe." },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: Buffer.from(jpeg).toString("base64"),
            },
          },
        ],
      },
    ],
    config: {
      systemInstruction: PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema: zodToJsonSchema(Recipe),
    },
  });

  // Schema-constrained decoding guarantees valid JSON, not correct values — parse anyway.
  return Recipe.parse(JSON.parse(res.text!));
}
```

```ts
// server/src/index.ts
import { Hono } from "hono";
import { extractRecipe } from "./extract";

const app = new Hono();

app.post("/import/photo", async (c) => {
  const form = await c.req.formData();
  const photo = form.get("photo") as File;
  const recipe = await extractRecipe(await photo.arrayBuffer());
  // persist to bun:sqlite here
  return c.json(recipe);
});

export default app;
```

Notes on the sketch:

- No image preprocessing. Gemini tiles at 768×768; a raw 12MP phone photo is ~1,000 image tokens.
  Only downscale if you hit a request-size limit.
- No OCR, no retry-on-parse loop, no second call. If it comes back wrong, the fix is the prompt or
  the schema, not another pipeline stage.
- `Recipe.parse()` after `JSON.parse()` is belt-and-braces, and cheap: the schema is enforced
  syntactically, not semantically.
- Multi-image is a `parts` array with several `inlineData` entries — same call, same schema. Worth
  knowing for the deferred multi-photo ticket; Mealie already does exactly this.

### Cost

**~$0.025 per extraction** on `gemini-3.1-pro-preview` (≈1,400 input tokens incl. image at
$2/M, ≈2,000 output tokens incl. thinking at $12/M). Roughly **75¢ for 30 recipes**.

Dropping to `gemini-3.6-flash` after the quality bar is met: **~$0.014**, ~42¢ for 30.
Batch API halves either figure if latency ever stops mattering.
