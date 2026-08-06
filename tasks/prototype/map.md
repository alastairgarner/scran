# Map: Recipe capture prototype

## Destination

A rough working prototype **running locally on my laptop**: take a photo of a cookbook page,
send it to a vision LLM, get back a structured recipe, persist it, and browse it in a minimal UI.
Quality bar deliberately low — this is a learning exercise and a feel-test, not a product.
Done when I can photograph a real recipe from a real book and see it in my own catalogue.

## Notes

**Domain**: self-hosted family recipe catalogue. Long-term intent is a public cheap-VPS Docker
deploy shared with friends and family — but none of that is in this map.

**This map carries execution.** The destination is a working artifact, not a spec, so `task`
tickets here build things. Code quality bar is low on purpose; skip tests, abstractions, and
error handling beyond "don't lose the photo".

**Prior art**: [Mealie](https://github.com/mealie-recipes/mealie) already does everything scran
is meant to do — URL scraper, photo→OCR+LLM import, ingredient parsing, scaling, shopping lists,
multi-user auth, Docker self-host. Deliberately not using it: too heavy, and building it is the
point. But it is the reference implementation — steal its schema and its prompts.

**Stack, settled during charting** (don't relitigate without a good reason):

- TypeScript end-to-end, **Bun** runtime
- **Monorepo**: Bun workspaces, separate `server/` and `client/`
- Server: **Hono**
- Client: **Vite** + React
- Persistence: **SQLite** (`bun:sqlite`)
- Recipe schema: **none** — the model's JSON stored verbatim. Source photos kept forever, which is
  what makes re-extraction cheap and every other data decision reversible.
- Capture: a single photo of a single page. One photo, one recipe.
- LLM: **OpenAI `gpt-5`**, one multimodal call with a JSON response schema. **No OCR stage** —
  see the vision-model ticket for why a pre-OCR pass makes cookbook photos worse, not better.

**Skills**: `/grilling` + `/domain-modeling` for the schema ticket. `/prototype` for UI work.

## Decisions so far

<!-- one line per closed ticket -->

- [Which vision LLM for cookbook-photo recipe extraction?](issues/01-vision-model-choice.md) —
  OpenAI `gpt-5`, one multimodal call, structured outputs, **no OCR stage** (a pre-OCR pass is
  actively harmful on photographed pages). Gemini won the benchmark and is the runner-up.
- [What is Mealie's recipe schema and image-import prompt?](issues/02-mealie-schema-and-prompt.md) —
  steal the flat `{quantity, unit, food, note, display, originalText, title}` ingredient model and
  the prompt; do **one** LLM pass, not Mealie's two; sub-groups are flat, ranges are lossy.
- [Get an OpenAI API key](issues/07-openai-api-key.md) — key in `.env` as `OPENAI_API_KEY`,
  gitignored, `.env.template` committed. A ChatGPT/Codex subscription grants no API access.
- [Lock scran's recipe schema](issues/03-recipe-schema.md) — **don't**. Store the model's JSON
  verbatim in one `recipes` table, `name` lifted out for the list view. Source photos retained
  permanently — the only irreplaceable data; everything else is one re-extraction script away.

## Not yet specified

- **Deploying it.** Cheap public VPS, Docker stack. Reverse proxy, TLS, image storage on a box
  with a small disk, backups of the SQLite file.
- **Auth.** Public URL, non-technical friends and family, so Tailscale is out (too many seats for
  the free tier). Needs something dead simple. Invite links? Single shared password? Real accounts?
- **URL import.** Paste a recipe website, scrape and extract. Originally part of the idea; a
  different enough pipeline (fetch + HTML, often with schema.org JSON-LD already present) that it
  waits until the photo path works.
- **Multi-photo capture.** Spreads, recipes that run over a page, two-column layouts. Depends on
  how badly single-photo extraction fails on real books.
- **Shopping lists and scaling.** Whichever gets built first is what forces ingredients to be
  structured (Mealie's `{quantity, unit, food, note}` is the reference). Done then, against real
  recipes with real failure cases, by re-extracting from photos already on disk — not guessed now.
- **Search and organisation at scale.** Fine to have a flat list at 10 recipes; not at 300. Tags,
  categories, full-text search.
- **Image storage.** *Whether* to keep the photos is settled (always). Still open: where they live
  once this leaves the laptop, and how they get backed up — a VPS with a small disk changes it.
- **Extraction quality loop.** What happens when the LLM gets it wrong — edit the recipe by hand,
  re-run with a different prompt, or both. Sharper now that the failure mode is known: a vision
  model returns fluent, plausible, *wrong* text rather than visible garbage, so errors are easy to
  miss. `originalText` per ingredient is the cheap tell for what got dropped.

## Out of scope

- **Meal planning / calendars.** Explicitly ruled out — Mealie territory, not wanted.
- **Dedicated scanner hardware.** Flatbed or document-scanner integration. A phone photo is the
  capture surface; scanner support is a hardware integration, not this effort.
- **Self-hosting Mealie instead of building scran.** Considered and rejected during charting:
  building it is the point of the exercise.
