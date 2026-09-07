import type { Ingredient } from '@scran/shared';

export type Speed = 'under-30' | '30-60' | 'over-60';
export type Scope = 'everyone' | 'me';

export function matchesSpeed(
  recipe: { totalMinutes: number | null },
  speed?: Speed,
): boolean {
  if (!speed) {
    return true;
  }
  if (recipe.totalMinutes === null) {
    return false;
  }
  if (speed === 'under-30') {
    return recipe.totalMinutes < 30;
  }
  if (speed === '30-60') {
    return recipe.totalMinutes >= 30 && recipe.totalMinutes <= 60;
  }
  return recipe.totalMinutes > 60;
}

export function aggregate(
  recipe: { ratings: { userId: string; score: number }[] },
  scope: Scope | undefined,
  userId: string,
): 1 | 2 | 3 | undefined {
  const ratings = recipe.ratings.filter(
    rating => scope !== 'me' || rating.userId === userId,
  );
  return ([1, 2, 3] as const)
    .map(score => ({
      score,
      count: ratings.filter(rating => rating.score === score).length,
    }))
    .sort((a, b) => b.count - a.count || a.score - b.score)
    .find(item => item.count > 0)?.score;
}

export function scaledIngredient(line: Ingredient, factor: number): string {
  if (factor === 1 || line.quantity === null) {
    return line.text;
  }
  return [
    Number((line.quantity * factor).toPrecision(3)).toString(),
    line.unit,
    line.food,
    line.note,
  ]
    .filter(Boolean)
    .join(' ');
}
