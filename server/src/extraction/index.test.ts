import { describe, expect, it } from 'bun:test';

import { extractionSchema } from '@scran/shared';

import { AppError } from '../errors';
import { RECORDED_PHOTOS, recordedComplete } from '../testing';
import webpage from './fixtures/webpage.json';
import { extract, NoRecipeFound } from './index';

const photo = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
const source = { kind: 'photo' as const, photo };

/** @returns {Promise<Record<string, unknown>>} The first recorded reply, parsed. */
const recordedRecipe = async () =>
  JSON.parse(
    (
      await recordedComplete()({
        prompt: '',
        source: { kind: 'photo', photo },
      })
    ).json,
  );

describe('extract', () => {
  it('recognises a source with no recipe', async () => {
    const complete = async () => ({
      model: 'test',
      json: 'null',
      tokensIn: 1,
      tokensOut: 1,
    });
    const error = await extract(source, { complete }).catch(cause => cause);
    expect(error).toBeInstanceOf(NoRecipeFound);
  });

  it('rejects an empty recipe instead of saving a misleading version', async () => {
    const complete = async () => ({
      model: 'test',
      json: JSON.stringify({
        ...(await recordedRecipe()),
        ingredients: [
          {
            title: null,
            text: '  ',
            quantity: null,
            unit: null,
            food: null,
            note: null,
          },
        ],
        instructions: [],
      }),
      tokensIn: 1,
      tokensOut: 1,
    });
    const error = await extract(source, { complete }).catch(cause => cause);
    expect(error).toBeInstanceOf(NoRecipeFound);
  });

  it('preserves a readable recipe fragment without inventing missing steps', async () => {
    const complete = async () => ({
      model: 'test',
      json: JSON.stringify({ ...(await recordedRecipe()), instructions: [] }),
      tokensIn: 1,
      tokensOut: 1,
    });
    const result = await extract(source, { complete });
    expect(result.content.ingredients.length).toBeGreaterThan(0);
    expect(result.content.instructions).toEqual([]);
  });

  it('maps a real reply onto the stored shape', async () => {
    // Act
    const result = await extract(source, { complete: recordedComplete() });

    // Assert — the snake_case names stop at this seam.
    expect(result.content.name).toBe('Chocolate Chip Muffins');
    expect(result.content.recipeYield).toBe('9 large muffins');
    expect(result.content.yieldQuantity).toBe(9);
    expect(result.content.totalMinutes).toBe(30);
    expect(result.content.timeEstimated).toBe(true);
    expect(result.content.ingredients[0]).toMatchObject({
      text: '1 1/2 c. all purpose flour',
      quantity: 1.5,
      unit: 'c.',
      food: 'all purpose flour',
    });
    expect(result.model).toBe('gpt-4.1');
    expect(result.promptVersion).toMatch(/^[0-9a-f]+$/);
    expect(result.tokensIn).toBeGreaterThan(0);
  });

  it('uses the webpage prompt and recorded response for HTML', async () => {
    // Arrange
    const recipe = '{"@type":"Recipe","name":"Chocolate chip muffins"}';
    const html = `<html><nav>lots of noise</nav><script type="application/ld+json">${recipe}</script></html>`;
    let prompt = '';
    let sent = '';

    // Act
    const result = await extract(
      { kind: 'html', html },
      {
        complete: request => {
          prompt = request.prompt;
          sent = request.source.kind === 'html' ? request.source.html : '';
          return Promise.resolve({
            model: webpage.model,
            json: JSON.stringify(webpage.recipe),
            tokensIn: webpage.usage.prompt_tokens,
            tokensOut: webpage.usage.completion_tokens,
          });
        },
      },
    );

    // Assert
    expect(prompt).toContain('webpage data');
    expect(sent).toBe(`[${recipe}]`);
    expect(result.content.name).toBe('Spaghetti alla Puttanesca');
  });

  it('falls back through recipe microdata before visible article text', async () => {
    // Arrange
    const html = `<html><script type="application/ld+json">{"@type":"BreadcrumbList"}</script><body><article>Wrong article</article><section itemtype="https://schema.org/Recipe"><h1>Right recipe</h1><p>2 eggs</p></section></body></html>`;
    const recorded = recordedComplete();
    let sent = '';

    // Act
    await extract(
      { kind: 'html', html },
      {
        complete: request => {
          sent = request.source.kind === 'html' ? request.source.html : '';
          return recorded(request);
        },
      },
    );

    // Assert
    expect(sent).toBe('Right recipe 2 eggs');
  });

  it('prefers a structured recipe card over flattened JSON-LD', async () => {
    const html = `<script type="application/ld+json">{"@type":"Recipe","recipeIngredient":["2 eggs"]}</script><div class="wprm-recipe-container"><span class="wprm-recipe-ingredient-amount">2</span><span class="wprm-recipe-ingredient-name">eggs</span></div>`;
    const recorded = recordedComplete();
    let sent = '';

    await extract(
      { kind: 'html', html },
      {
        complete: request => {
          sent = request.source.kind === 'html' ? request.source.html : '';
          return recorded(request);
        },
      },
    );

    expect(sent).toContain('wprm-recipe-ingredient-amount');
    expect(sent).not.toContain('recipeIngredient');
  });

  it('normalises the diet implication the model may forget', async () => {
    // Arrange — vegan without vegetarian beside it.
    const vegan = ['vegan', 'main'];
    const complete = async () => ({
      model: 'test',
      json: JSON.stringify({ ...(await recordedRecipe()), tags: vegan }),
      tokensIn: 1,
      tokensOut: 1,
    });

    // Act
    const result = await extract(source, { complete });

    // Assert
    expect(result.tags.sort()).toEqual(['main', 'vegan', 'vegetarian']);
  });

  it('treats unreadable JSON as the upstream failing, not the caller', async () => {
    // Arrange
    const complete = async () => ({
      model: 'test',
      json: 'not json at all',
      tokensIn: 1,
      tokensOut: 1,
    });

    // Act
    const thrown = await extract(source, { complete }).catch(e => e);

    // Assert — retryable from the photo on disk.
    expect(thrown).toBeInstanceOf(AppError);
    expect(thrown.type).toBe('dependency');
    expect(thrown.retryable).toBe(true);
  });

  it('rejects a reply that misses the schema', async () => {
    // Arrange — a plausible object with the wrong types.
    const complete = async () => ({
      model: 'test',
      json: JSON.stringify({ name: 'Soup', ingredients: 'a list, honestly' }),
      tokensIn: 1,
      tokensOut: 1,
    });

    // Act
    const thrown = await extract(source, { complete }).catch(e => e);

    // Assert
    expect(thrown).toBeInstanceOf(AppError);
    expect(thrown.type).toBe('dependency');
  });
});

describe('the recorded fixtures', () => {
  it('all still satisfy the schema they were recorded against', async () => {
    // A fixture recorded against an older prompt is a test that passes while
    // the real thing is broken — this is the guard against that.
    for (const name of RECORDED_PHOTOS) {
      const { json } = await recordedComplete(name)({
        prompt: '',
        source: { kind: 'photo', photo },
      });
      expect(extractionSchema.safeParse(JSON.parse(json)).success).toBe(true);
    }
    expect(extractionSchema.safeParse(webpage.recipe).success).toBe(true);
  });
});
