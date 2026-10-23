/**
 * The one module that talks to OpenAI. Everything about the wire — the URL,
 * the key, the message shape, structured outputs — stops here; `extract` above
 * it sees a function that takes a prompt and a source and returns JSON text.
 *
 * That is also the test seam ticket 05 asked for: `extract(source, deps)`
 * defaults `complete` to this and a test passes a recorded reply instead, with
 * no mocking framework anywhere.
 */
import { extractionSchema } from '@scran/shared';
import { z } from 'zod';

import { config } from '../config';
import { AppError } from '../errors';
import {
  OPENAI_MAX_COMPLETION_TOKENS,
  OPENAI_TIMEOUT_MS,
} from '../resource-limits';

/** What a completion cost and who produced it — the version's metadata. */
export type Completion = {
  model: string;
  /** The model's reply, unparsed. Trusting it is `extract`'s job, not this one. */
  json: string;
  tokensIn: number;
  tokensOut: number;
};

export type CompleteRequest = {
  prompt: string;
  source:
    | { kind: 'photo'; photo: Blob }
    | { kind: 'photos'; photos: Blob[] }
    | { kind: 'html'; html: string };
};

export type Complete = (request: CompleteRequest) => Promise<Completion>;

/**
 * Generated from the zod schema rather than hand-written — verified against a
 * live call before the shape was settled: `z.toJSONSchema` keeps every field
 * `description` (which is where most of the extraction instruction lives), and
 * emits `additionalProperties: false` with every property required, which is
 * exactly what strict mode demands. So the contract is defined once.
 */
const responseSchema = z.object({
  recipe: extractionSchema
    .nullable()
    .describe(
      'The recipe visible in the source. Return null if there is no readable recipe. Never invent a recipe from a photo of food or an unrelated image.',
    ),
});
const jsonSchema = z.toJSONSchema(responseSchema, { target: 'draft-7' });

const IMAGE_PROMPT_PATH = new URL(
  './prompts/parse-recipe-image.txt',
  import.meta.url,
);

const HTML_PROMPT_PATH = new URL(
  './prompts/parse-recipe-html.txt',
  import.meta.url,
);

/** The two source-specific prompts. */
export const prompts = {
  photo: await Bun.file(IMAGE_PROMPT_PATH).text(),
  html: await Bun.file(HTML_PROMPT_PATH).text(),
};

/**
 * One multimodal call.
 *
 * @returns {Promise<Completion>} The model's raw JSON reply and its usage.
 * @throws {AppError} `dependency` when OpenAI refuses or fails — the request
 *   was fine and the upstream wasn't, so the capture stays retryable.
 */
export const complete: Complete = async request => {
  const content =
    request.source.kind === 'html'
      ? `Extract exactly one recipe from this webpage HTML:\n\n${request.source.html}`
      : [
          {
            type: 'text',
            text: 'These images are consecutive pages of ONE recipe in reading order. Read them together and return exactly one combined recipe, not one per image. Return recipe: null if there is no readable recipe.',
          },
          ...(await Promise.all(
            (request.source.kind === 'photo'
              ? [request.source.photo]
              : request.source.photos
            ).map(async photo => ({
              type: 'image_url',
              image_url: {
                url: `data:${photo.type || 'image/jpeg'};base64,${Buffer.from(await photo.arrayBuffer()).toString('base64')}`,
              },
            })),
          )),
        ];
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.openaiApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.openaiModel,
      max_completion_tokens: OPENAI_MAX_COMPLETION_TOKENS,
      // GPT-4.1 at temperature zero is the tested extraction configuration.
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'recipe', strict: true, schema: jsonSchema },
      },
      messages: [
        { role: 'system', content: request.prompt },
        { role: 'user', content },
      ],
    }),
  }).catch(cause => {
    throw AppError.dependency('The recipe reader is unavailable.', {}, cause);
  });

  if (!response.ok) {
    throw AppError.dependency('The recipe reader is unavailable.', {
      status: response.status,
      body: (await response.text()).slice(0, 500),
    });
  }

  // Only the fields we read; the model's own JSON stays text until `extract`
  // parses it through zod.
  const chatCompletionSchema = z.object({
    choices: z
      .array(z.object({ message: z.object({ content: z.string() }) }))
      .min(1),
    usage: z.object({
      prompt_tokens: z.number().int().nonnegative(),
      completion_tokens: z.number().int().nonnegative(),
    }),
  });
  let body: z.infer<typeof chatCompletionSchema>;
  let reply: unknown;
  try {
    body = chatCompletionSchema.parse(await response.json());
    reply = JSON.parse(body.choices[0]?.message.content ?? 'null');
  } catch (cause) {
    throw AppError.dependency(
      'The recipe reader returned an unreadable response.',
      {},
      cause,
    );
  }
  const result = responseSchema.safeParse(reply);
  if (!result.success) {
    throw AppError.dependency('The recipe reader returned the wrong shape.');
  }
  return {
    model: config.openaiModel,
    json: JSON.stringify(result.data.recipe),
    tokensIn: body.usage.prompt_tokens,
    tokensOut: body.usage.completion_tokens,
  };
};
