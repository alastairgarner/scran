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
- Recipe schema: borrow Mealie's, especially structured ingredients (`{quantity, unit, food, note}`)
- Capture: a single photo of a single page. One photo, one recipe.
- LLM provider: undecided, see the research ticket

**Skills**: `/grilling` + `/domain-modeling` for the schema ticket. `/prototype` for UI work.

## Decisions so far

<!-- one line per closed ticket -->

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
- **Shopping lists and scaling.** The reason ingredients get structured now. Not built here.
- **Search and organisation at scale.** Fine to have a flat list at 10 recipes; not at 300. Tags,
  categories, full-text search.
- **Image storage.** Do the source photos get kept after extraction? Where?
- **Extraction quality loop.** What happens when the LLM gets it wrong — edit the recipe by hand,
  re-run with a different prompt, or both.

## Out of scope

- **Meal planning / calendars.** Explicitly ruled out — Mealie territory, not wanted.
- **Dedicated scanner hardware.** Flatbed or document-scanner integration. A phone photo is the
  capture surface; scanner support is a hardware integration, not this effort.
- **Self-hosting Mealie instead of building scran.** Considered and rejected during charting:
  building it is the point of the exercise.
