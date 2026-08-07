# Persist recipes and browse them

Type: task
Status: resolved
Blocked by: 03, 05

## Question

Turn one-shot extraction into a catalogue.

- Write extracted recipes to SQLite using the one-table layout from ticket 03 (`name` lifted out,
  the model's JSON in `data`, photo path alongside)
- A list view: every recipe I've captured
- A detail view: ingredients and steps, readable on a phone held in a kitchen
- Enough of a capture flow that adding a recipe is: take photo, upload, see it in the list

That's the whole prototype. No search, no tags, no editing, no auth — a flat list is fine at
ten recipes and the fog covers what happens at three hundred.

Done when I've photographed a few real recipes from real books and the catalogue is something
I'd actually cook from.

## Answer

Built. The prototype is complete: photo in, recipe in the catalogue, cookable on a phone.

**Storage** — ticket 03's layout, unchanged:

```sql
CREATE TABLE IF NOT EXISTS recipes (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  data       TEXT NOT NULL,
  photo_path TEXT NOT NULL,
  created_at TEXT NOT NULL
)
```

`data/scran.db`. The sidecar `<photo>.json` from ticket 05 is still written **as well** — it
carries `model` and `usage`, which is what makes comparing two models possible later.

**Changed**: `server/src/index.ts` (db open, insert on extract, `GET /api/recipes`,
`GET /api/recipes/:id`), `server/package.json`, `client/src/main.tsx` (list + detail + capture),
`client/src/main.css` (new, mobile-first), `README.md`.

**Verified** at a 390×844 viewport against a live extraction: upload → ~6.5s OpenAI call →
row written → appears at the top of the list without a reload → detail view renders. A sectioned
recipe ("FOR THE TOFU AND GREENS" / "FOR THE XO SAUCE" / "TO SERVE") groups correctly.
Typecheck clean in both workspaces; ticket 05's tests still pass.

**`bun dev` never loaded the root `.env`.** Pre-existing, not introduced by this ticket:
`bun run --filter` sets cwd per workspace, so the server saw no `OPENAI_API_KEY` and every
extraction 401'd — ticket 05 must have been exercised by running the server from the repo root.
Fixed with `--env-file=../.env`. The prototype was not runnable via its own documented entry
point until now, which is worth remembering the next time "it works on my laptop" is the bar.

**Deliberately skipped**: serving the photo on the detail view (the obvious next thing when the
hand-edit path graduates), routing (`useState`, no react-router), any backfill code in the repo.

Verification left two duplicate rows (ids 5 and 6) and two duplicate photos in `data/photos/`.
