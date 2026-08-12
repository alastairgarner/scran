import { describe, expect, it } from 'bun:test';
import { extractionSchema } from '@scran/shared';
import { AppError } from '../errors';
import { RECORDED_PHOTOS, recordedComplete } from '../testing';
import { extract } from './index';

const photo = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
const source = { kind: 'photo' as const, photo };

/** @returns {Promise<Record<string, unknown>>} The first recorded reply, parsed. */
const recordedRecipe = async () =>
  JSON.parse((await recordedComplete()({ prompt: '', photo })).json);

describe('extract', () => {
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
      const { json } = await recordedComplete(name)({ prompt: '', photo });
      expect(extractionSchema.safeParse(JSON.parse(json)).success).toBe(true);
    }
  });
});
