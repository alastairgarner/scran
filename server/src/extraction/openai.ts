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
  source: { kind: 'photo'; photo: Blob } | { kind: 'html'; html: string };
};

export type Complete = (request: CompleteRequest) => Promise<Completion>;

/**
 * Generated from the zod schema rather than hand-written — verified against a
 * live call before the shape was settled: `z.toJSONSchema` keeps every field
 * `description` (which is where most of the extraction instruction lives), and
 * emits `additionalProperties: false` with every property required, which is
 * exactly what strict mode demands. So the contract is defined once.
 */
const jsonSchema = z.toJSONSchema(extractionSchema, { target: 'draft-7' });

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
    request.source.kind === 'photo'
      ? [
          {
            type: 'text',
            text: 'Please extract the recipe from the image provided. There should be exactly one recipe.',
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${request.source.photo.type || 'image/jpeg'};base64,${Buffer.from(await request.source.photo.arrayBuffer()).toString('base64')}`,
            },
          },
        ]
      : `Extract exactly one recipe from this webpage HTML:\n\n${request.source.html}`;
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.openaiApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.openaiModel,
      // Measured, not assumed: at the default this page came back with 13, 11
      // and 13 ingredients across three runs; at 0 it was 10, 10, 10 with the
      // yield, the time and the tags identical every time. It does not buy
      // full determinism — the model still misreads small print differently
      // each run — but everything downstream of the reading stops moving.
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
  });

  if (!response.ok) {
    throw AppError.dependency('The recipe reader is unavailable.', {
      status: response.status,
      body: (await response.text()).slice(0, 500),
    });
  }

  // Only the fields we read; the model's own JSON stays text until `extract`
  // parses it through zod.
  type ChatCompletion = {
    choices: { message: { content: string } }[];
    usage: { prompt_tokens: number; completion_tokens: number };
  };
  const body = (await response.json()) as ChatCompletion;
  return {
    model: config.openaiModel,
    json: body.choices[0]?.message?.content ?? '',
    tokensIn: body.usage.prompt_tokens,
    tokensOut: body.usage.completion_tokens,
  };
};
