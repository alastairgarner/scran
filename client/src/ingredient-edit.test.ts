import { describe, expect, it } from 'bun:test';

import { ingredientFromText } from './ingredient-edit';
import { scaledIngredient } from './recipe-logic';

describe('editing an ingredient line', () => {
  it('re-derives the amount without changing the written text or heading', () => {
    const line = ingredientFromText({
      text: '  1 1/2 tbsp olive oil, plus extra  ',
      title: 'For the sauce',
    });
    expect(line).toEqual({
      text: '  1 1/2 tbsp olive oil, plus extra  ',
      title: 'For the sauce',
      quantity: 1.5,
      unit: 'tbsp',
      food: 'olive oil',
      note: 'plus extra',
    });
    expect(scaledIngredient(line, 2)).toBe('3 tbsp olive oil plus extra');
  });

  it('handles counted ingredients, compact units, and Unicode fractions', () => {
    for (const [text, quantity, unit, food] of [
      ['2 eggs', 2, null, 'eggs'],
      ['200g flour', 200, 'g', 'flour'],
      ['1 tbsp. oil', 1, 'tbsp', 'oil'],
      ['1½ cups flour', 1.5, 'cups', 'flour'],
      ['½ onion', 0.5, null, 'onion'],
    ]) {
      expect(
        ingredientFromText({ text: String(text), title: null }),
      ).toMatchObject({ quantity, unit, food });
    }
  });

  it('leaves ambiguous quantities unscaled rather than keeping a stale amount', () => {
    for (const text of [
      'salt to taste',
      '2–3 eggs',
      '1 cup flour OR 2 cups cocoa',
      '1/0 cup water',
      '1 1/4 c. + 1/4 c. flour',
    ]) {
      const line = ingredientFromText({ text, title: null });
      expect(line.quantity).toBeNull();
      expect(scaledIngredient(line, 2)).toBe(text);
    }
  });
});
