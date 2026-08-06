# What is Mealie's recipe schema and image-import prompt?

Type: research
Status: resolved

## Question

Mealie is the reference implementation. Extract the two things worth stealing.

**The schema.** From the Mealie repo, the recipe model as it actually exists in code: fields on
a recipe, and specifically the structured ingredient model (reportedly `{quantity, unit, food,
note}` plus a display string). Also: how it stores instructions/steps, servings and yield, times
(prep/cook/total), source URL/attribution, and how it handles the messy real-world cases — a
recipe with ingredient sub-groups ("For the sauce:"), a step that references a quantity, and a
range like "2-3 cloves".

**The prompt.** Mealie's image-import prompt lives in-repo as a prompt file (something like
`parse-recipe-image.txt`, alongside others in the same directory). Find the actual file, read it,
and report it verbatim along with how it's assembled into the API call.

Also note which schema fields exist purely for Mealie features scran doesn't want (meal planning,
households, cookbooks) so they can be dropped.

Answer with: the fields worth keeping, the ingredient model in full, the verbatim prompt, and a
link to each source file.

## Answer

Pinned to `mealie-next` @ `8396900`. Full findings, verbatim prompts and every source link:
[`../research/02-mealie-schema-and-prompt.md`](../research/02-mealie-schema-and-prompt.md).

**Three findings that change what we build:**

1. **The image prompt does not produce structured ingredients.** Mealie's photo import returns
   free-text ingredient lines and dumps each whole line into `note`; `{quantity, unit, food, note}`
   comes from a *separate second LLM call* with its own prompt. That split exists because Mealie's
   parser resolves against a shared foods/units database, dedupes entities and scores per-field
   confidence — none of which scran has. **Do one pass**, with the ingredient rules grafted into
   the image schema. The image is better context for parsing an ingredient line than the line alone.

2. **Sub-groups are flat, not nested.** `title` is set only on the first ingredient/step of a
   section and null on the rest. Cheap, reorder-safe, proven — steal it verbatim.

3. **Ranges are lossy by design.** "For ranges, use the lower number"; there is no `quantityMax`
   anywhere in the schema, parser or frontend. `originalText` is the only record. Follow it for the
   prototype — if "2-3 cloves" rendering as "2 cloves" grates, the cheap fix is putting the range
   in `note`, not adding a field.

**Ingredient model** (the bit worth keeping): `quantity`, `unit`, `food`, `note`, `display`,
`originalText`, `title`. `note` carrying the *whole line* when parsing fails is what makes it
degrade gracefully — a half-parsed recipe still renders. Don't drop it. `originalText` echoing the
raw scanned line is the only cheap way to see what the model dropped.

`unit`/`food` are FK'd entities in Mealie (units/foods tables, fuzzy-deduped) purely to serve
shopping lists and unit conversion — both fog here. Its own validators accept bare strings, so
collapsing to strings now is a later migration, not a redesign.

**Drop:** meal planning, households, cookbooks, notifiers, tools, and the vestigial OCR column.

**Techniques worth copying wholesale:** prompt text in `.txt` files rather than string literals
(trivially diffable when tuning), and *field-description-as-prompt* — most of the extraction
instruction lives in the response schema, not the prompt.

A suggested `Recipe`/`Ingredient`/`Step` TypeScript type is at the end of the research file. It is
input to ticket 03, not a decision — 03 owns the final call.
