import { describe, expect, it } from 'bun:test';
import { aggregate, matchesSpeed, scaledIngredient } from './recipe-logic';

describe('client recipe rules', () => {
  it('ties ratings downward and scopes them to me', () => {
    const recipe = {
      ratings: [
        { userId: 'a', score: 3 },
        { userId: 'b', score: 1 },
      ],
    };

    expect(aggregate(recipe, 'everyone', 'a')).toBe(1);
    expect(aggregate(recipe, 'me', 'a')).toBe(3);
  });

  it('keeps speed-band boundaries stable', () => {
    expect(matchesSpeed({ totalMinutes: 29 }, 'under-30')).toBe(true);
    expect(matchesSpeed({ totalMinutes: 30 }, '30-60')).toBe(true);
    expect(matchesSpeed({ totalMinutes: 60 }, '30-60')).toBe(true);
    expect(matchesSpeed({ totalMinutes: 61 }, 'over-60')).toBe(true);
    expect(matchesSpeed({ totalMinutes: null }, 'over-60')).toBe(false);
  });

  it('scales parsed parts but leaves the note verbatim', () => {
    expect(
      scaledIngredient(
        {
          title: null,
          text: '1 corn on the cob or 200g frozen kernels',
          quantity: 1,
          unit: null,
          food: 'corn on the cob',
          note: 'or 200g frozen kernels',
        },
        2,
      ),
    ).toBe('2 corn on the cob or 200g frozen kernels');
  });
});
