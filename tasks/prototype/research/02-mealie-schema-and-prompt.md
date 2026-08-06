# Mealie's recipe schema and image-import prompt

Research for `tasks/prototype/issues/02-mealie-schema-and-prompt.md`.

Source: [mealie-recipes/mealie](https://github.com/mealie-recipes/mealie), branch `mealie-next`,
read at commit [`8396900`](https://github.com/mealie-recipes/mealie/commit/8396900d3eea415697649a8f36714bed28a0a864)
(2026-08-05). All links below are pinned to `mealie-next`.

## TL;DR

- The full recipe model is [`Recipe`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/schema/recipe/recipe.py#L182)
  extending [`RecipeSummary`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/schema/recipe/recipe.py#L116).
  Roughly a third of its fields are multi-tenancy / meal-plan / shopping-list plumbing.
- The structured ingredient is `{quantity: float, unit: Unit|null, food: Food|null, note: str}`
  plus a **derived** `display` string and a **preserved** `original_text`. `unit` and `food` are
  full FK'd entities (a units table and a foods table), not strings.
- **The image prompt does not produce structured ingredients.** Photo import returns
  *free-text* ingredient lines. Structured `{quantity,unit,food,note}` comes from a **separate
  second LLM call** with its own prompt (`parse-recipe-ingredients.txt`), run on demand.
  This is the single most important finding for scran.
- Sub-groups ("For the sauce:") are **not** a nested structure. They are a `title` field on the
  *first* ingredient/step of a section, with `title` null on the rest. Flat list, sentinel titles.
- Ranges ("2-3 cloves") are **lossy**. The prompt says use the lower number. Nothing in the
  schema, the parser, or the frontend represents a range. `original_text` is the only record.

---

## 1. The schema

### 1.1 `Recipe` — the Pydantic model

[`mealie/schema/recipe/recipe.py`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/schema/recipe/recipe.py)

`RecipeSummary` (the list-view projection, lines 116–175):

| Field | Type | Notes |
|---|---|---|
| `id` | `UUID4 \| None` | |
| `user_id`, `household_id`, `group_id` | `UUID4` | multi-tenancy — **drop** |
| `name` | `str \| None` | |
| `slug` | `str` | derived from `name` via `create_recipe_slug` |
| `image` | `Any \| None` | in the DB it's just a string filename; files live on disk under `RECIPE_DATA_DIR/<id>/images/` |
| `recipe_servings` | `float` (default 0) | numeric servings |
| `recipe_yield_quantity` | `float` (default 0) | numeric yield |
| `recipe_yield` | `str \| None` | the yield *unit* text, e.g. `"cookies"` |
| `total_time` | `str \| None` | free text, e.g. `"1 hour 30 minutes"` |
| `prep_time` | `str \| None` | free text |
| `cook_time` | `str \| None` | free text — **legacy, barely used** (see below) |
| `perform_time` | `str \| None` | free text — this is the *actual* "cook time" field |
| `description` | `str \| None` | |
| `recipe_category` | `list[RecipeCategory]` | |
| `tags` | `list[RecipeTag]` | |
| `tools` | `list[RecipeTool]` | **drop** |
| `rating` | `float \| None` | aggregate of per-user ratings |
| `org_url` | `str \| None` | alias `orgURL` — **source URL / attribution** |
| `date_added` | `date \| None` | |
| `date_updated`, `created_at`, `updated_at` | `datetime \| None` | four overlapping timestamps |
| `last_made` | `datetime \| None` | |

`Recipe` adds (lines 182–193):

| Field | Type | Notes |
|---|---|---|
| `recipe_ingredient` | `list[RecipeIngredient]` | ordered; sub-group titles inline |
| `recipe_instructions` | `list[RecipeStep] \| None` | ordered |
| `nutrition` | `Nutrition \| None` | 11 all-`str` fields |
| `settings` | `RecipeSettings \| None` | **drop** |
| `assets` | `list[RecipeAsset] \| None` | file attachments |
| `notes` | `list[RecipeNote] \| None` | `{title, text}` |
| `extras` | `dict \| None` | arbitrary API key-value bag |
| `comments` | `list[RecipeCommentOut] \| None` | **drop** |

Times are **strings, not durations**. `clean_time()` in
[`cleaner.py`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/scraper/cleaner.py#L403)
converts ISO-8601 `PT1H30M` into the human string `"1 hour 30 minutes"` on the way in, and the
string is what gets stored. Nothing does arithmetic on times.

`cook_time` vs `perform_time`: both columns exist on the table, but the OpenAI schema, the
scraper and the image importer only ever write `perform_time`. `cook_time` is a legacy column
kept for old imports. **scran should have exactly one cook-time field.**

### 1.2 `RecipeModel` — the SQLAlchemy table

[`mealie/db/models/recipe/recipe.py`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/db/models/recipe/recipe.py)

Same fields plus: `name_normalized` / `description_normalized` (search index columns,
auto-maintained by SQLAlchemy `set` events), `share_tokens`, `timeline_events`, `meal_entries`,
`shopping_list_refs`, `shopping_list_item_refs`, `rated_by`, `favorited_by`, `made_by`,
`referenced_ingredients`, and two deprecated columns `recipeCuisine` and `is_ocr_recipe`.

Ordering of ingredients and steps is a `position` integer column, managed by SQLAlchemy's
`ordering_list("position")` — i.e. array order in the API, integer column in the DB.

### 1.3 The structured ingredient — in full

[`mealie/schema/recipe/recipe_ingredient.py`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/schema/recipe/recipe_ingredient.py)

```python
class RecipeIngredientBase(MealieModel):
    quantity: NoneFloat = 0
    unit: IngredientUnit | CreateIngredientUnit | None = None
    food: IngredientFood | CreateIngredientFood | None = None
    referenced_recipe: Recipe | None = None      # "1 batch of <other recipe>"
    note: str | None = ""
    display: str = ""
    """
    How the ingredient should be displayed
    Automatically calculated after the object is created, unless overwritten
    """

class RecipeIngredient(RecipeIngredientBase):
    title: str | None = None          # section header — shows only if present
    original_text: str | None = None  # the raw line as scanned/scraped
    reference_id: UUID = Field(default_factory=uuid4)
```

Key points:

- **`unit` and `food` are entities, not strings.** `IngredientUnit` carries
  `{id, name, plural_name, description, abbreviation, plural_abbreviation, use_abbreviation,
  fraction, aliases[], standard_quantity, standard_unit, extras}`. `IngredientFood` carries
  `{id, name, plural_name, description, label_id, label, aliases[], extras,
  households_with_ingredient_food}`. They live in group-scoped `ingredient_units` /
  `ingredient_foods` tables ([`db/models/recipe/ingredient.py`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/db/models/recipe/ingredient.py))
  and are deduplicated across the whole catalogue by fuzzy match. This exists to power
  shopping-list aggregation and unit conversion — it is the expensive half of the model.
  A Pydantic validator accepts a bare string and wraps it (`validate_unit`, `validate_food`),
  so a string-only implementation is schema-compatible with the shape.
- **`display` is derived, not stored.** `_format_display()` (lines 301–323) concatenates
  `[quantity?] [unit?] [food?] [note?]`, with quantity rendered as a Unicode fraction
  (`Fraction(...).limit_denominator(32)`, superscript/subscript digits) unless
  `unit.fraction is False`, plural handling driven by locale. If `display` is passed in
  non-empty it is left alone — so it doubles as a manual override.
- **`note` is the escape hatch.** When the parser can't split a line, the whole line goes in
  `note` and `quantity/unit/food` stay empty. Rendering still works because `display` falls
  back to just the note. This is why free-text-only import (below) works at all: it writes
  `RecipeIngredient(note=<whole line>)`.
- `reference_id` is a per-ingredient UUID used to link steps to ingredients (§1.6).
- `quantity` is rounded to 3 dp on write (`INGREDIENT_QTY_PRECISION`).

### 1.4 Instructions / steps

[`mealie/schema/recipe/recipe_step.py`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/schema/recipe/recipe_step.py)

```python
class IngredientReferences(MealieModel):
    reference_id: UUID4 | None = None

class RecipeStep(MealieModel):
    id: UUID | None = Field(default_factory=uuid4)
    title: str | None = ""    # This is the section title!!!
    summary: str | None = ""
    text: str
    ingredient_references: list[IngredientReferences] = []
```

Table: [`db/models/recipe/instruction.py`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/db/models/recipe/instruction.py)
— `recipe_instructions` with `position`, plus a join table `recipe_ingredient_ref_link`
(`instruction_id` → `reference_id`).

`text` is a single markdown blob per step. No sub-steps, no timers, no structured actions.

### 1.5 Servings and yield

Three fields, split by
[`clean_yield()`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/scraper/cleaner.py#L364):

```python
def clean_yield(yields) -> tuple[float, float, str]:
    # returns (servings_qty, yield_qty, yield_str)
```

It pulls the leading number out of each yield string, then decides: if the string contains a
localised serving word (`serves`, `servings`, `makes`, `yield`, …) the number becomes
`recipe_servings`; otherwise the number becomes `recipe_yield_quantity` and the remainder
becomes `recipe_yield`. So `"4 servings"` → `servings=4`; `"12 cookies"` → `yield_quantity=12,
yield="cookies"`. Display is `f"{recipe_yield_quantity} {recipe_yield}"`.

The numeric split exists purely so the frontend can scale (`useScaledAmount(amount, scale)` in
[`use-scaled-amount.ts`](https://github.com/mealie-recipes/mealie/blob/mealie-next/frontend/app/composables/recipes/use-scaled-amount.ts)
— a plain multiply, rounded to 3 dp). Note this was retrofitted in
[migration `b1020f328e98`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/alembic/versions/2024-10-23-15.50.59_b1020f328e98_add_recipe_yield_quantity.py);
`recipe_yield` used to be the only field.

The image-import LLM schema does **not** produce the split — it returns `recipe_yield` as one
free-text string (`"12 cookies"`, `"4 servings"`), and `_convert_recipe` assigns it straight to
`recipe_yield`, leaving both numeric fields at 0.

### 1.6 The messy cases

**Ingredient sub-groups ("For the sauce:")** — a flat list with sentinel titles. The section
header is `RecipeIngredient.title` set on the *first* ingredient of the section; every other
ingredient in that section has `title = None`. Identical scheme for steps
(`RecipeStep.title` — the source comment literally reads `# This is the section title!!!`).
The frontend reconstructs sections by scanning in order and carrying the last non-empty title
forward — see `ingredientSectionTitles` in
[`RecipePageInstructions.vue`](https://github.com/mealie-recipes/mealie/blob/mealie-next/frontend/app/components/Domain/Recipe/RecipePage/RecipePageParts/RecipePageInstructions.vue#L586).
The LLM schema encodes the same rule in its field description:
*"Only set on the first item in each section."*

Cheap, order-dependent, and it round-trips through drag-and-drop reordering without a nested
structure. Worth copying verbatim.

**Ranges like "2-3 cloves"** — not supported anywhere. The ingredient prompt says:

> For ranges (e.g., "3-5", "1 to 2"), use the lower number

`quantity` is a single `float`. `extract_quantity_from_string`
([`string_utils.py`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/parser_services/parser_utils/string_utils.py#L57))
handles mixed fractions, vulgar fractions (`½` → `1/2`) and decimals, but takes the first number
it finds and stops — for `"2-3"` that's `2`. There is no `quantity_max`, no range type, no
grep hit for "range" in the parser or the frontend. The only surviving record of the range is
`original_text` (and, if the model is behaving, a `note`).

**Steps referencing quantities** — `RecipeStep.ingredient_references: [{reference_id}]`, a
many-to-many from step to ingredient by the ingredient's `reference_id` UUID. It is *not*
produced by the LLM. It is set two ways:

1. Manually, in a link-ingredients dialog on the recipe page.
2. Auto, by a naive frontend text scan —
   [`use-extract-ingredient-references.ts`](https://github.com/mealie-recipes/mealie/blob/mealie-next/frontend/app/composables/recipe-page/use-extract-ingredient-references.ts):
   split the step text on whitespace, drop words ≤2 chars, drop a hardcoded blacklist
   (`and, the, for, with, without`) and any word containing a digit, then substring-match each
   remaining word against each ingredient's display text. The source comment calls its own
   approach "kind of a cludgey implementation".

The payoff is cook mode: the referenced ingredients render underneath the step, scaled. It is
a display convenience layered on top, entirely optional, and clearly the weakest part of the
model.

---

## 2. The prompt

### 2.1 Where prompts live

[`mealie/services/openai/prompts/`](https://github.com/mealie-recipes/mealie/tree/mealie-next/mealie/services/openai/prompts):

- `general/debug.txt`
- `general/transcribe-audio.txt`
- `recipes/parse-recipe-image.txt`
- `recipes/parse-recipe-ingredients.txt`
- `recipes/parse-recipe-video.txt`
- `recipes/scrape-recipe.txt`

Plain `.txt`, no templating language, addressed by dot path (`recipes.parse-recipe-image`).
Users can override any of them by dropping a same-named file into
`OPENAI_CUSTOM_PROMPT_DIR` with the same relative path.

### 2.2 `parse-recipe-image.txt` — verbatim

[Source](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/openai/prompts/recipes/parse-recipe-image.txt)

```text
You are a bot that reads an image, or a set of images, and parses it into recipe JSON. You will receive an image from the user and you need to extract the recipe data. It is imperative that you do not create any data or otherwise make up any information.

The user message that you receive will be one or more images. Assume all images provided belong to a single recipe, not multiple recipes. The recipe may consist of printed text or handwritten text. It may be rotated or not properly cropped. It is your job to figure out which part of the image is the important content and extract it.

If the user requests a translation, translate all text (name, ingredients, instructions, etc.) to the requested language. Otherwise, preserve the text as-is.
```

That's the whole file. Six sentences, no JSON schema, no examples, no field list. **All the
schema information is carried by the structured-output response format**, not the prompt (§2.4).

### 2.3 `parse-recipe-ingredients.txt` — verbatim

This is the one that actually produces `{quantity, unit, food, note}`.
[Source](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/openai/prompts/recipes/parse-recipe-ingredients.txt)

```text
Parse ingredient strings into components. You will receive a list of one or more ingredients. It is critical that you return the same number of ingredients as given and in the same order.

When parsing:
- If uncertain about quantity, unit, or food, put the entire string in the note field
- Respect grammar rules for multiple languages
- Interpret singular/plural/grammatical variations
- Text in parentheses = notes (e.g., "3 potatoes (roughly chopped)" → note: "roughly chopped")
- Correct common typos (e.g., "potatos" → "potatoes")
- Recognize units: tablespoon, teaspoon, gram, tsp, tbsp, oz, sprig, can, bundle, bunch, unit, cube, package, pinch
- For ranges (e.g., "3-5", "1 to 2"), use the lower number
- All text must appear somewhere, or otherwise be accounted for; if converting "2 dozen" → "24", don't put "dozen" elsewhere. If you're unsure, put extra text in the notes
```

At call time a data injection is appended listing every unit alias already in the user's units
table, under this header
([`parser.py:108–125`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/parser_services/openai/parser.py#L108)):

> Below is a list of units found in the units database. While parsing, you should reference this
> list when determining which part of the input is the unit. You may find a unit in the input
> that does not exist in this list. This should not prevent you from parsing that text as a unit.

### 2.4 The other three, verbatim

[`recipes/scrape-recipe.txt`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/openai/prompts/recipes/scrape-recipe.txt):

```text
Extract recipe data from webpage contents (HTML, text, etc.) and return it in schema.org Recipe format. Reference: https://schema.org/Recipe

Do not create or make up any information. If insufficient data is found, return an empty object.

You will receive the webpage contents, including (but not necessarily limited to) text extracted from the HTML.
```

[`recipes/parse-recipe-video.txt`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/openai/prompts/recipes/parse-recipe-video.txt):

```text
You will receive a video transcript and the video's original caption text. Analyze BOTH inputs to generate a single, accurate recipe in schema.org Recipe format. Reference: https://schema.org/Recipe

Do not create or make up any information. If insufficient data is found, return an empty object.

- The video transcript is the primary source for instructions.
- The caption text is the primary source for the ingredient list and title.
- If there is a conflict (e.g., caption says "1 cup" but transcript says "1.5 cups"), trust the video transcript.
```

[`general/transcribe-audio.txt`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/openai/prompts/general/transcribe-audio.txt):

```text
Transcribe any audio data provided to you. You should respond only with the audio transcription and nothing else.
```

### 2.5 How the image call is assembled

Caller: `OpenAIRecipeService.build_recipe_from_images` in
[`mealie/services/recipe/recipe_service.py:624–658`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/recipe/recipe_service.py#L624).

```python
prompt = openai_service.get_prompt("recipes.parse-recipe-image")

openai_images = [OpenAILocalImage(filename=os.path.basename(image), path=image) for image in images]
message = (
    f"Please extract the recipe from the {'images' if len(openai_images) > 1 else 'image'} provided."
    "There should be exactly one recipe."
)
if translate_language:
    message += f" Please translate the recipe to {translate_language}."

response = await openai_service.get_response(
    prompt, message, response_schema=OpenAIRecipe, attachments=openai_images,
)
recipe = self._convert_recipe(response)
```

(The missing space before `"There should be exactly one recipe."` is in the source.)

Transport: [`mealie/services/openai/openai.py`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/openai/openai.py).
`get_response` builds one system message (the prompt file) and one user message whose content
is an array: `{"type": "text", "text": message}` followed by one `{"type": "image_url",
"image_url": {"url": ...}}` per image. Then:

```python
await client.chat.completions.parse(
    messages=[{"role": "system", "content": prompt},
              {"role": "user",   "content": content}],
    model=provider.model,
    response_format=response_schema,   # a Pydantic model
)
```

Images are minified to JPEG via Pillow and inlined as
`data:image/jpeg;base64,...` (`OpenAILocalImage.get_image_url`, lines 84–94). Structured
output is OpenAI's native `response_format=<pydantic model>`; the response text is then
re-validated with `model_validate_json` after stripping null bytes
([`schema/openai/_base.py`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/schema/openai/_base.py)).

Note the whole stack is OpenAI-SDK-shaped but provider-agnostic — `base_url`, `api_key`,
`model`, extra headers and query params are all per-provider config, and image/audio/default
providers are chosen separately.

### 2.6 The LLM response schema for images

This is where the field semantics actually live —
[`mealie/schema/openai/recipe.py`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/schema/openai/recipe.py).
Every field description is doing prompt work:

```python
class OpenAIRecipe(OpenAIBase):
    name: str                 # "Recipe name or title. Make your best guess if not obvious."
    description: str | None   # "A brief description of the recipe in a few words or sentences."
    recipe_yield: str | None  # "Recipe yield, e.g., '12 cookies' or '4 servings'."
    total_time: str | None    # "Total time as text (e.g., '1 hour 30 minutes'). Use if only one time is available."
    prep_time: str | None     # "Prep time as text, e.g., '30 minutes'. Do not duplicate total_time."
    perform_time: str | None  # "Cook/perform time as text, e.g., '1 hour'. Do not duplicate total_time."
    ingredients: list[OpenAIRecipeIngredient]
    instructions: list[OpenAIRecipeInstruction]
    notes: list[OpenAIRecipeNotes]

class OpenAIRecipeIngredient(OpenAIBase):
    title: str | None  # "Ingredient section title (e.g., 'Dry Ingredients'). Only set on the first item in each section."
    text: str          # "The complete ingredient text, e.g., '1 cup of flour' or '2 cups of onions, chopped'."

class OpenAIRecipeInstruction(OpenAIBase):
    title: str | None  # "Instruction section title. Only set on the first step in each section."
    text: str          # "One instruction step. Do not include numeric prefixes like '1.' or 'Step 1',
                       #  but do include word-based prefixes like 'First' or 'Second'."

class OpenAIRecipeNotes(OpenAIBase):
    title: str | None  # "Note title. Ignore generic titles like 'Note' or 'Info' and leave blank."
    text: str          # "The note content, such as tips, variations, or preparation advice."
```

And the ingredient-parse schema
([`schema/openai/recipe_ingredient.py`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/schema/openai/recipe_ingredient.py)):

```python
class OpenAIIngredient(OpenAIBase):
    quantity: float | None = 0  # "The numerical quantity as a whole number or float. Convert fractions to decimals."
    unit: str | None            # "The unit of measurement, e.g., 'cups', 'lbs', 'teaspoons'."
    food: str | None            # "The ingredient itself, e.g., 'onions' or 'chicken breast'."
    note: str | None            # "Preparation details, e.g., 'chopped', 'drained', 'peeled and minced'.
                                #  If there are any elements you're not sure about, put them here."
```

### 2.7 The two-pass architecture (important)

`_convert_recipe` ([`recipe_service.py:599`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/recipe/recipe_service.py#L599)):

```python
recipe_ingredient=[
    RecipeIngredient(title=ingredient.title, note=ingredient.text)
    for ingredient in openai_recipe.ingredients if ingredient.text
],
```

Photo import produces **unstructured** ingredients — the whole line lands in `note`.
`quantity`/`unit`/`food` are empty until the user separately triggers ingredient parsing, which
sends the list of strings to the *other* prompt and gets `{quantity, unit, food, note}` back
([`openai/parser.py`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/services/parser_services/openai/parser.py)).
That second pass then:

- keeps `original_text` = the input line,
- fuzzy-matches `unit`/`food` strings against existing DB entities (`find_ingredient_match`),
- computes a per-field confidence score (`IngredientConfidence`) by comparing the LLM's
  quantity against a regex-extracted one and checking every word of the `note` appears in the
  original text, plus a `rapidfuzz` token-sort ratio of `display` vs `original_text`,
- refuses the whole batch if the count of returned ingredients ≠ count sent.

Two prompts, two calls, and a hard count check plus confidence scoring on the structured one.
Mealie clearly does not trust a single call to do both jobs.

---

## 3. Fields that exist purely for features scran doesn't want

| Field(s) | Feature | Verdict |
|---|---|---|
| `group_id`, `household_id`, `user_id` | groups / households multi-tenancy | drop |
| `meal_entries` (→ `GroupMealPlan`) | meal planning | drop |
| `shopping_list_refs`, `shopping_list_item_refs` | shopping lists | drop |
| `tools` / `RecipeTool.households_with_tool` / `recipes_to_tools` | Tools feature (per-household equipment) | drop |
| `settings` (`public`, `show_nutrition`, `show_assets`, `landscape_view`, `disable_comments`, `locked`) | per-recipe sharing/permissions | drop |
| `comments`, `share_tokens` | multi-user commenting, public share links | drop |
| `timeline_events`, `last_made`, `made_by` | recipe timeline | drop |
| `rating`, `rated_by`, `favorited_by` | per-user ratings/favourites | drop for now |
| `extras`, `assets` | API extension bag, file attachments | drop |
| `IngredientFood.label_id` / `MultiPurposeLabel` | shopping-list aisle grouping | drop |
| `IngredientFood.households_with_ingredient_food`, `on_hand` | "in my pantry" per household | drop |
| `IngredientUnit.standard_quantity` / `standard_unit` / `aliases` | unit conversion + dedup | drop |
| `IngredientFood.aliases`, `plural_name` | food dedup + plural rendering | drop |
| `name_normalized`, `description_normalized`, `note_normalized`, `original_text_normalized` | Postgres trigram search columns | drop — SQLite FTS5 if needed later |
| `recipeCuisine`, `is_ocr_recipe` | already deprecated in Mealie | drop |
| `cook_time` | legacy duplicate of `perform_time` | drop, keep one |
| `slug` | pretty URLs, unique per group | drop for a prototype |

Cookbooks and notifiers add **nothing** to the recipe model — cookbooks are saved
category/tag/tool filter queries
([`db/models/household/cookbook.py`](https://github.com/mealie-recipes/mealie/blob/mealie-next/mealie/db/models/household/cookbook.py)),
notifiers are event-bus subscribers. Nothing to strip.

---

## RECOMMENDATION

### What to keep

Keep, because a cookbook page actually contains them: `name`, `description`, `ingredients`,
`instructions`, `notes`, `servings`, `yield`, `prepTime`, `cookTime`, `totalTime`, `source`
(= Mealie's `org_url`, repurposed as free-text attribution: *"Nigel Slater, Tender Vol. 1,
p.204"* — a photo import has no URL), plus `image` and `createdAt`.

Deliberate drops beyond §3: `slug` (use the id), the four-way timestamp mess (one `createdAt`),
`nutrition` (11 string fields no photo import will fill), and `RecipeStep.summary`.

Deliberate steals: the **flat-list-with-sentinel-`title`** trick for sub-groups, `originalText`
on every ingredient, and `note`-as-escape-hatch.

Deliberate deferral: `ingredientReferences` (step→ingredient links). It's a cook-mode nicety,
the LLM doesn't produce it, and Mealie's own auto-linker is a substring hack its authors call
cludgey. Add when cook mode exists.

### The ingredient model

Copy Mealie's shape, but collapse `unit` and `food` from entities to plain strings. The entity
tables exist for shopping-list aggregation and unit conversion — both explicitly out of scope
in `map.md`. Mealie's own validators accept a bare string in those slots, so upgrading later is
a data migration, not a redesign.

```
quantity     number | null   one float, ranges collapse to the low end
unit         string | null   "tbsp", "cloves", null for "3 eggs"
food         string | null   "unsalted butter"
note         string          preparation detail, or the WHOLE line when parsing fails
display      string          derived: [qty] [unit] [food] [note]
originalText string          the raw scanned line — the only lossless record
title        string | null   section header, set ONLY on the first item of a section
```

`note` carrying the whole line on failure is what makes the model degrade gracefully: a
half-parsed recipe still renders correctly. Don't drop it.

On ranges: Mealie throws them away. For a prototype, follow it — take the low number and let
`originalText` carry the truth. If "2-3 cloves" rendering as "2 cloves" turns out to grate,
the cheap fix is putting the range in `note` rather than adding a `quantityMax` field.

### Suggested minimal TypeScript type

```typescript
export type Ingredient = {
  quantity: number | null;
  unit: string | null;
  food: string | null;
  note: string;          // prep detail, or the whole line if parsing failed
  display: string;       // derived: [qty] [unit] [food] [note]
  originalText: string;  // raw line as scanned
  title: string | null;  // section header, first item of the section only
};

export type Step = {
  title: string | null;  // section header, first step of the section only
  text: string;
};

export type Recipe = {
  id: string;
  name: string;
  description: string | null;
  servings: number | null;      // "4 servings" -> 4
  yield: string | null;         // "12 cookies", free text
  prepTime: string | null;      // free text: "30 minutes"
  cookTime: string | null;      // free text: "1 hour"
  totalTime: string | null;     // free text
  ingredients: Ingredient[];    // ordered; sections via Ingredient.title
  instructions: Step[];         // ordered; sections via Step.title
  notes: { title: string; text: string }[];
  source: string | null;        // book + page, or a URL later
  image: string | null;         // path to the source photo
  createdAt: string;
};
```

### On the prompt: do one pass, not two

Mealie's split (free-text image pass, then a separate structured-ingredient pass) exists because
its ingredient parse must resolve against a shared foods/units database, dedupe entities, and
score confidence per field. scran has none of that. With `unit`/`food` as plain strings there is
nothing the second call knows that the first one doesn't — and the image is *better* context for
parsing an ingredient line than the line alone.

So: one call, `parse-recipe-image.txt` (basically verbatim — it's short and it's good), with a
response schema whose ingredient item is the full `{quantity, unit, food, note, title}`. Then
graft in the four rules from `parse-recipe-ingredients.txt` that actually matter for a photo:

- uncertain about quantity/unit/food → put the whole line in `note`
- parentheses → `note`
- ranges → use the lower number
- all text must be accounted for somewhere

Keep the `originalText` field in the schema and make the model echo the raw line into it; that's
the only cheap way to see what it dropped. Keep the "only set `title` on the first item of a
section" instruction — it's already proven.

Worth copying wholesale from Mealie regardless of pass count: prompt text in `.txt` files rather
than string literals (trivially diffable when tuning), and the *field-description-as-prompt*
technique — most of the extraction instruction lives in the response schema, not the prompt.
