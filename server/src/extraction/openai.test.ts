import { describe, expect, it, spyOn } from 'bun:test';

import { AppError } from '../errors';
import { NoRecipeFound, extract } from './index';
import { complete, prompts } from './openai';

describe('the recipe reader response', () => {
  it('sends all images in reading order in one multimodal model request', async () => {
    const fetch = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        choices: [{ message: { content: '{"recipe":null}' } }],
        usage: { prompt_tokens: 12, completion_tokens: 4 },
      }),
    );
    try {
      await complete({
        prompt: prompts.photo,
        source: {
          kind: 'photos',
          photos: [
            new Blob(['first page'], { type: 'image/png' }),
            new Blob(['second page'], { type: 'image/jpeg' }),
          ],
        },
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      const body = fetch.mock.calls[0]?.[1]?.body;
      if (typeof body !== 'string') {
        throw new Error('Expected JSON model request');
      }
      const sent = JSON.parse(body);
      expect(sent.messages[1].content).toEqual([
        { type: 'text', text: expect.stringContaining('ONE recipe') },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${Buffer.from('first page').toString('base64')}`,
          },
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${Buffer.from('second page').toString('base64')}`,
          },
        },
      ]);
    } finally {
      fetch.mockRestore();
    }
  });

  it('carries a no-recipe answer through the real adapter', async () => {
    const reply = Response.json({
      choices: [{ message: { content: '{"recipe":null}' } }],
      usage: { prompt_tokens: 12, completion_tokens: 4 },
    });
    const fetch = spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply)
      .mockResolvedValueOnce(reply.clone());
    try {
      const source = {
        kind: 'photo' as const,
        photo: new Blob(['not a recipe']),
      };
      const result = await complete({ prompt: prompts.photo, source });
      expect(result).toMatchObject({
        json: 'null',
        tokensIn: 12,
        tokensOut: 4,
      });
      const error = await extract(source).catch(cause => cause);
      expect(error).toBeInstanceOf(NoRecipeFound);
    } finally {
      fetch.mockRestore();
    }
  });

  it('treats a missing recipe field as a reader failure, not a no-recipe answer', async () => {
    const fetch = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        choices: [{ message: { content: '{}' } }],
        usage: { prompt_tokens: 12, completion_tokens: 4 },
      }),
    );
    try {
      const error = await complete({
        prompt: prompts.photo,
        source: { kind: 'photo', photo: new Blob() },
      }).catch(cause => cause);
      expect(error).toBeInstanceOf(AppError);
    } finally {
      fetch.mockRestore();
    }
  });
});
