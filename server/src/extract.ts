const MODEL = process.env.OPENAI_MODEL ?? "gpt-5";

const prompt = await Bun.file(
  new URL("./prompts/parse-recipe-image.txt", import.meta.url),
).text();

const nullableString = { type: ["string", "null"] };

const sectioned = (text: string) => ({
  type: "object",
  additionalProperties: false,
  required: ["title", "text"],
  properties: {
    title: {
      ...nullableString,
      description: "Section title. Only set on the first item in each section.",
    },
    text: { type: "string", description: text },
  },
});

// Mealie's image response schema, near-verbatim: the field descriptions carry most of the
// extraction instruction, not the prompt. Ingredients stay whole lines — ticket 03.
const schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "description",
    "recipe_yield",
    "total_time",
    "prep_time",
    "perform_time",
    "ingredients",
    "instructions",
    "notes",
  ],
  properties: {
    name: {
      type: "string",
      description: "Recipe name or title. Make your best guess if not obvious.",
    },
    description: {
      ...nullableString,
      description:
        "A brief description of the recipe in a few words or sentences.",
    },
    recipe_yield: {
      ...nullableString,
      description: "Recipe yield, e.g., '12 cookies' or '4 servings'.",
    },
    total_time: {
      ...nullableString,
      description:
        "Total time as text (e.g., '1 hour 30 minutes'). Use if only one time is available.",
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
    ingredients: {
      type: "array",
      items: sectioned(
        "The complete ingredient text, e.g., '1 cup of flour' or '2 cups of onions, chopped'.",
      ),
    },
    instructions: {
      type: "array",
      items: sectioned(
        "One instruction step. Do not include numeric prefixes like '1.' or 'Step 1', but do include word-based prefixes like 'First' or 'Second'.",
      ),
    },
    notes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "text"],
        properties: {
          title: {
            ...nullableString,
            description:
              "Note title. Ignore generic titles like 'Note' or 'Info' and leave blank.",
          },
          text: {
            type: "string",
            description:
              "The note content, such as tips, variations, or preparation advice.",
          },
        },
      },
    },
  },
};

/** One multimodal call. Returns the model's JSON as-is, plus token usage for costing. */
export async function extractRecipe(photo: Blob) {
  const base64 = Buffer.from(await photo.arrayBuffer()).toString("base64");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: {
        type: "json_schema",
        json_schema: { name: "recipe", strict: true, schema },
      },
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please extract the recipe from the image provided. There should be exactly one recipe.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${photo.type || "image/jpeg"};base64,${base64}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as any;
  return {
    model: MODEL,
    recipe: JSON.parse(body.choices[0].message.content),
    usage: body.usage,
  };
}
