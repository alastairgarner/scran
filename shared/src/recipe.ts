/**
 * The recipe schemas: what the model is asked for, and what a version holds.
 *
 * Two shapes, deliberately. `extractionSchema` is the **model contract** —
 * snake_case, Mealie's field names, and field `description`s that carry most of
 * the extraction instruction (ticket 10). It is the JSON Schema OpenAI receives
 * *and* the parse of its reply, so the contract is written once.
 * `recipeContentSchema` is the **stored** shape — camelCase, matching the
 * columns — and is what an edit posts. `toRecipeContent` is the only crossing.
 */
import { z } from 'zod';

import { TAG_IDS } from './tags';

const sectioned = (text: string) =>
  z.object({
    title: z
      .string()
      .nullable()
      .describe('Section title. Only set on the first item in each section.'),
    text: z.string().describe(text),
  });

/**
 * Ticket 10. `text` remains the verbatim line and is the only thing a human
 * reads; the four parts below exist solely so a line can be multiplied. They
 * are all nullable, and a null `quantity` means the line cannot be scaled at
 * all — the renderer falls back to `text` and marks it so. Never guess one.
 */
const ingredient = sectioned(
  "The complete ingredient line exactly as written, e.g., '1 cup of flour' or '2 cups of onions, chopped'.",
).extend({
  quantity: z
    .number()
    .nullable()
    .describe(
      'The amount as a decimal number: "1 1/2" is 1.5, "½" is 0.5, "2-3" is 2 (a range takes its lower number). A line that asks for one of something without writing the numeral still has a quantity of 1, with whatever it is counted by as the unit: "a bunch of spring onions" is 1 "bunch", "a thumb-sized piece of ginger" is 1 "thumb-sized piece", "a small bunch of coriander" is 1 "small bunch". Otherwise set to null unless the line states one single unambiguous amount. Null when there is no amount at all ("Kosher salt and freshly ground black pepper", "vegetable oil, for frying"), when the line offers a choice between different amounts ("1 1/2 c. flour OR 1 1/4 c. + 1/4 c. cocoa"), and when an amount is a sum of parts ("1 1/4 c. + 1/4 c."). A line offering a choice of ingredient at one single amount is NOT ambiguous: "1/3 c. melted butter or corn oil" has a quantity of 0.333.',
    ),
  unit: z
    .string()
    .nullable()
    .describe(
      'The unit of measure as the page writes it, singular and without the number: "cup", "tablespoon", "g", "clove", "thumb-sized piece", "bunch". Anything the page counts by is a unit — it does not have to be a standard measure. Null when the amount counts the food itself, which is the case whenever the unit would simply repeat the food: "1 egg" is 1, null, "egg"; "2 red chillies" is 2, null, "red chillies"; "1 small red onion" is 1, null, "small red onion". Null whenever quantity is null.',
    ),
  food: z
    .string()
    .nullable()
    .describe(
      'The ingredient itself with the amount, the unit and any preparation stripped off: "1 clove of garlic, peeled and finely chopped" gives "garlic". Keep a choice of ingredient intact: "melted butter or corn oil". Null whenever quantity is null.',
    ),
  note: z
    .string()
    .nullable()
    .describe(
      'Preparation or qualification carried by the line, with no amount in it: "peeled and finely chopped", "plus 1 teaspoon extra for the greens", "optional". Null if the line has none.',
    ),
});

/**
 * Mealie's image response schema, near-verbatim, plus ticket 10's quantities
 * and ticket 19's tags and time. Everything is required and nullable rather
 * than optional: OpenAI strict mode demands every property be required.
 */
export const extractionSchema = z.object({
  name: z
    .string()
    .describe('Recipe name or title. Make your best guess if not obvious.'),
  description: z
    .string()
    .nullable()
    .describe('A brief description of the recipe in a few words or sentences.'),
  recipe_yield: z
    .string()
    .nullable()
    .describe(
      "Recipe yield exactly as the page writes it, e.g., '12 cookies' or '4 servings'. Never normalise it to match yield_quantity: a page saying '9-10 large muffins' keeps both numbers here.",
    ),
  yield_quantity: z
    .number()
    .nullable()
    .describe(
      'The number in recipe_yield, as a decimal, taking the lower number of a range: "9-10 large muffins" is 9, "Serves 4" is 4. Null if recipe_yield is null or states no number.',
    ),
  yield_unit: z
    .string()
    .nullable()
    .describe(
      'What recipe_yield counts, without the number: "large muffins", "servings". Null whenever yield_quantity is null.',
    ),
  total_time: z
    .string()
    .nullable()
    .describe(
      "Total time as text (e.g., '1 hour 30 minutes'), copied from the page. Use if only one time is available. Null if the page states no total time — the licence to judge a duration belongs to total_minutes alone and never reaches this field.",
    ),
  prep_time: z
    .string()
    .nullable()
    .describe(
      "Prep time as text, e.g., '30 minutes'. Do not duplicate total_time.",
    ),
  perform_time: z
    .string()
    .nullable()
    .describe(
      "Cook/perform time as text, e.g., '1 hour'. Do not duplicate total_time.",
    ),
  total_minutes: z
    .number()
    .nullable()
    .describe(
      'How long the recipe takes end to end, in whole minutes. Read it from the page where the page says so. Where it does not, judge it from the method — this is the one and only thing you may work out rather than read. Exclude unattended time: an overnight prove or a two-hour chill is not time the cook spends. Null only if even a judgement is impossible.',
    ),
  time_estimated: z
    .boolean()
    .nullable()
    .describe(
      'This records where the number came from, not how precise it is. false if you copied total_minutes off the page — a page saying "About 1 hour" is still the page telling you, so that is false. true only if the page gave no whole-recipe time anywhere and you worked one out by reading the method; a page stating one part of the time ("20 minutes bake time") and no total counts as giving none. Null whenever total_minutes is null.',
    ),
  tags: z
    .array(z.enum(TAG_IDS))
    .describe(
      'Tags describing the dish. Exactly one of vegetarian, pescatarian or meat, judged on the ingredients as written — a recipe offering a vegan alternative is still whatever it is as written. Add vegan as well as vegetarian when nothing in it comes from an animal. Then zero or more course tags; a dish that is genuinely both a main and a side gets both.',
    ),
  ingredients: z.array(ingredient),
  instructions: z.array(
    sectioned(
      "One instruction step. Do not include numeric prefixes like '1.' or 'Step 1', but do include word-based prefixes like 'First' or 'Second'.",
    ),
  ),
  notes: z.array(
    z.object({
      title: z
        .string()
        .nullable()
        .describe(
          "Note title. Ignore generic titles like 'Note' or 'Info' and leave blank.",
        ),
      text: z
        .string()
        .describe(
          'The note content, such as tips, variations, or preparation advice.',
        ),
    }),
  ),
});

export type Extraction = z.infer<typeof extractionSchema>;

/** A `{title, text}` pair — an instruction step or a note. */
export const sectionSchema = z.object({
  title: z.string().max(300).nullable(),
  text: z.string().max(8000),
});

/** An ingredient line: the verbatim text, plus ticket 10's scalable parts. */
export const ingredientSchema = sectionSchema.extend({
  quantity: z.number().nullable(),
  unit: z.string().max(300).nullable(),
  food: z.string().max(1000).nullable(),
  note: z.string().max(2000).nullable(),
});

/**
 * What one version of a recipe holds — the model's output mapped onto the
 * columns, and equally what a person's edit posts. Tags are absent on purpose:
 * they hang off the recipe, not the version (ticket 19).
 */
export const recipeContentSchema = z
  .object({
    name: z.string().trim().min(1, 'A recipe needs a name.').max(300),
    description: z.string().max(8000).nullable(),
    recipeYield: z.string().max(300).nullable(),
    yieldQuantity: z.number().nullable(),
    yieldUnit: z.string().max(300).nullable(),
    totalTime: z.string().max(300).nullable(),
    prepTime: z.string().max(300).nullable(),
    performTime: z.string().max(300).nullable(),
    totalMinutes: z.number().int().nullable(),
    timeEstimated: z.boolean().nullable(),
    ingredients: z.array(ingredientSchema).max(200),
    instructions: z.array(sectionSchema).max(200),
    notes: z.array(sectionSchema).max(100),
  })
  .refine(
    content =>
      new TextEncoder().encode(JSON.stringify(content)).byteLength <=
      128 * 1024,
    {
      message: 'A recipe must fit within 128 KiB.',
    },
  );

/**
 * The household's scale, as ticket 04 stored it: 1 cross, 2 tick, 3 double
 * tick. Numbers so "best rated" can sort; never averaged.
 */
export const ratingSchema = z.object({
  score: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

/** What a person wrote. `notes` is the page's own; this is a comment. */
export const commentSchema = z.object({
  body: z.string().trim().min(1, 'Say something.').max(2000),
});

export type RecipeContent = z.infer<typeof recipeContentSchema>;
export type Ingredient = z.infer<typeof ingredientSchema>;
export type Section = z.infer<typeof sectionSchema>;

/**
 * The one place the model's field names are translated. Everything downstream
 * of this speaks the stored shape and never learns Mealie's naming.
 *
 * @returns {RecipeContent} The version content. Tags travel separately.
 */
export function toRecipeContent(extraction: Extraction): RecipeContent {
  return {
    name: extraction.name,
    description: extraction.description,
    recipeYield: extraction.recipe_yield,
    yieldQuantity: extraction.yield_quantity,
    yieldUnit: extraction.yield_unit,
    totalTime: extraction.total_time,
    prepTime: extraction.prep_time,
    performTime: extraction.perform_time,
    // The model is asked for whole minutes and mostly obliges; rounding here
    // costs a line and means the column's INTEGER is never a lie.
    totalMinutes:
      extraction.total_minutes === null
        ? null
        : Math.round(extraction.total_minutes),
    timeEstimated: extraction.time_estimated,
    ingredients: extraction.ingredients,
    instructions: extraction.instructions,
    notes: extraction.notes,
  };
}
