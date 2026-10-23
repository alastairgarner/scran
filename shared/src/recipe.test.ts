import { describe, expect, it } from 'bun:test';

import { recipeContentSchema, type RecipeContent } from './recipe';

const recipe = (): RecipeContent => ({
  name: 'Soup',
  description: null,
  recipeYield: null,
  yieldQuantity: null,
  yieldUnit: null,
  totalTime: null,
  prepTime: null,
  performTime: null,
  totalMinutes: null,
  timeEstimated: null,
  ingredients: [],
  instructions: [{ title: null, text: 'Simmer.' }],
  notes: [],
});

describe('recipe content limits', () => {
  it('retains ordinary recipe content', () => {
    expect(recipeContentSchema.parse(recipe())).toEqual(recipe());
  });

  it('bounds names, section text, metadata and array lengths', () => {
    for (const change of [
      { name: 'x'.repeat(301) },
      { recipeYield: 'x'.repeat(301) },
      { instructions: [{ title: null, text: 'x'.repeat(8001) }] },
      {
        ingredients: Array.from({ length: 201 }, () => ({
          title: null,
          text: 'Salt',
          quantity: null,
          unit: null,
          food: null,
          note: null,
        })),
      },
      {
        notes: Array.from({ length: 101 }, () => ({
          title: null,
          text: 'Tip',
        })),
      },
    ]) {
      expect(
        recipeContentSchema.safeParse({ ...recipe(), ...change }).success,
      ).toBe(false);
    }
  });

  it('bounds total serialized UTF-8 bytes even when each field fits', () => {
    const content = recipe();
    content.instructions = Array.from({ length: 20 }, () => ({
      title: null,
      text: '🥣'.repeat(2000),
    }));
    expect(recipeContentSchema.safeParse(content).success).toBe(false);
  });
});
