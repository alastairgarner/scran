import { describe, expect, it, spyOn } from 'bun:test';

import { AppError } from '../errors';
import { NoRecipeFound, extract } from './index';
import { complete, prompts } from './openai';

describe('the recipe reader response', () => {
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
