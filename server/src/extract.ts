import { TAG_IDS } from '@scran/shared';

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-5';

const prompt = await Bun.file(
  new URL('./prompts/parse-recipe-image.txt', import.meta.url),
).text();

const nullableString = { type: ['string', 'null'] };
const nullableNumber = { type: ['number', 'null'] };

const sectioned = (text: string) => ({
  type: 'object',
  additionalProperties: false,
  required: ['title', 'text'],
  properties: {
    title: {
      ...nullableString,
      description: 'Section title. Only set on the first item in each section.',
    },
    text: { type: 'string', description: text },
  },
});

// Ticket 10. `text` remains the verbatim line and is the only thing a human
// reads; the four parts below exist solely so a line can be multiplied. They
// are all nullable, and a null `quantity` means the line cannot be scaled at
// all — the renderer falls back to `text` and marks it so. Never guess one.
const ingredientParts = {
  quantity: {
    ...nullableNumber,
    description:
      'The amount as a decimal number: "1 1/2" is 1.5, "½" is 0.5, "2-3" is 2 (a range takes its lower number). A line that asks for one of something without writing the numeral still has a quantity of 1, with whatever it is counted by as the unit: "a bunch of spring onions" is 1 "bunch", "a thumb-sized piece of ginger" is 1 "thumb-sized piece", "a small bunch of coriander" is 1 "small bunch". Otherwise set to null unless the line states one single unambiguous amount. Null when there is no amount at all ("Kosher salt and freshly ground black pepper", "vegetable oil, for frying"), when the line offers a choice between different amounts ("1 1/2 c. flour OR 1 1/4 c. + 1/4 c. cocoa"), and when an amount is a sum of parts ("1 1/4 c. + 1/4 c."). A line offering a choice of ingredient at one single amount is NOT ambiguous: "1/3 c. melted butter or corn oil" has a quantity of 0.333.',
  },
  unit: {
    ...nullableString,
    description:
      'The unit of measure as the page writes it, singular and without the number: "cup", "tablespoon", "g", "clove", "thumb-sized piece", "bunch". Anything the page counts by is a unit — it does not have to be a standard measure. Null when the amount counts the food itself, which is the case whenever the unit would simply repeat the food: "1 egg" is 1, null, "egg"; "2 red chillies" is 2, null, "red chillies"; "1 small red onion" is 1, null, "small red onion". Null whenever quantity is null.',
  },
  food: {
    ...nullableString,
    description:
      'The ingredient itself with the amount, the unit and any preparation stripped off: "1 clove of garlic, peeled and finely chopped" gives "garlic". Keep a choice of ingredient intact: "melted butter or corn oil". Null whenever quantity is null.',
  },
  note: {
    ...nullableString,
    description:
      'Preparation or qualification carried by the line, with no amount in it: "peeled and finely chopped", "plus 1 teaspoon extra for the greens", "optional". Null if the line has none.',
  },
};

// Mealie's image response schema, near-verbatim: the field descriptions carry most of the
// extraction instruction, not the prompt. Ingredients stay whole lines — ticket 03.
const schema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name',
    'description',
    'recipe_yield',
    'yield_quantity',
    'yield_unit',
    'total_time',
    'prep_time',
    'perform_time',
    'total_minutes',
    'time_estimated',
    'tags',
    'ingredients',
    'instructions',
    'notes',
  ],
  properties: {
    name: {
      type: 'string',
      description: 'Recipe name or title. Make your best guess if not obvious.',
    },
    description: {
      ...nullableString,
      description:
        'A brief description of the recipe in a few words or sentences.',
    },
    recipe_yield: {
      ...nullableString,
      description:
        "Recipe yield exactly as the page writes it, e.g., '12 cookies' or '4 servings'. Never normalise it to match yield_quantity: a page saying '9-10 large muffins' keeps both numbers here.",
    },
    yield_quantity: {
      ...nullableNumber,
      description:
        'The number in recipe_yield, as a decimal, taking the lower number of a range: "9-10 large muffins" is 9, "Serves 4" is 4. Null if recipe_yield is null or states no number.',
    },
    yield_unit: {
      ...nullableString,
      description:
        'What recipe_yield counts, without the number: "large muffins", "servings". Null whenever yield_quantity is null.',
    },
    total_time: {
      ...nullableString,
      description:
        "Total time as text (e.g., '1 hour 30 minutes'), copied from the page. Use if only one time is available. Null if the page states no total time — the licence to judge a duration belongs to total_minutes alone and never reaches this field.",
    },
    prep_time: {
      ...nullableString,
      description:
        "Prep time as text, e.g., '30 minutes'. Do not duplicate total_time.",
    },
    perform_time: {
      ...nullableString,
      description:
        "Cook/perform time as text, e.g., '1 hour'. Do not duplicate total_time.",
    },
    total_minutes: {
      ...nullableNumber,
      description:
        'How long the recipe takes end to end, in whole minutes. Read it from the page where the page says so. Where it does not, judge it from the method — this is the one and only thing you may work out rather than read. Exclude unattended time: an overnight prove or a two-hour chill is not time the cook spends. Null only if even a judgement is impossible.',
    },
    time_estimated: {
      type: ['boolean', 'null'],
      description:
        'This records where the number came from, not how precise it is. false if you copied total_minutes off the page — a page saying "About 1 hour" is still the page telling you, so that is false. true only if the page gave no whole-recipe time anywhere and you worked one out by reading the method; a page stating one part of the time ("20 minutes bake time") and no total counts as giving none. Null whenever total_minutes is null.',
    },
    tags: {
      type: 'array',
      description:
        'Tags describing the dish. Exactly one of vegetarian, pescatarian or meat, judged on the ingredients as written — a recipe offering a vegan alternative is still whatever it is as written. Add vegan as well as vegetarian when nothing in it comes from an animal. Then zero or more course tags; a dish that is genuinely both a main and a side gets both.',
      items: { type: 'string', enum: TAG_IDS },
    },
    ingredients: {
      type: 'array',
      items: (() => {
        const base = sectioned(
          "The complete ingredient line exactly as written, e.g., '1 cup of flour' or '2 cups of onions, chopped'.",
        );
        return {
          ...base,
          required: [...base.required, ...Object.keys(ingredientParts)],
          properties: { ...base.properties, ...ingredientParts },
        };
      })(),
    },
    instructions: {
      type: 'array',
      items: sectioned(
        "One instruction step. Do not include numeric prefixes like '1.' or 'Step 1', but do include word-based prefixes like 'First' or 'Second'.",
      ),
    },
    notes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'text'],
        properties: {
          title: {
            ...nullableString,
            description:
              "Note title. Ignore generic titles like 'Note' or 'Info' and leave blank.",
          },
          text: {
            type: 'string',
            description:
              'The note content, such as tips, variations, or preparation advice.',
          },
        },
      },
    },
  },
};

/** One multimodal call. Returns the model's JSON as-is, plus token usage for costing. */
export async function extractRecipe(photo: Blob) {
  const base64 = Buffer.from(await photo.arrayBuffer()).toString('base64');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'recipe', strict: true, schema },
      },
      messages: [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Please extract the recipe from the image provided. There should be exactly one recipe.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${photo.type || 'image/jpeg'};base64,${base64}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  }
  // Only the fields we read. The model's own JSON stays untyped on purpose — ticket 03.
  type ChatCompletion = {
    choices: { message: { content: string } }[];
    usage: { total_tokens: number };
  };
  const body = (await res.json()) as ChatCompletion;
  return {
    model: MODEL,
    recipe: JSON.parse(body.choices[0].message.content),
    usage: body.usage,
  };
}
