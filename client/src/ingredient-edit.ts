import type { Ingredient } from '@scran/shared';

const FRACTIONS: Record<string, number> = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
};
const UNITS =
  /^(kg|g|mg|ml|l|oz|lb|lbs|tsp|tbsp|cups?|tablespoons?|teaspoons?|grams?|kilograms?|millilitres?|litres?|ounces?|pounds?|cloves?|cans?|tins?|bunch(?:es)?|pinch(?:es)?)\b\.?\s*/i;

/** Keep the written line; only scale amounts that can be read unambiguously. */
export function ingredientFromText({
  text,
  title,
}: {
  text: string;
  title: string | null;
}): Ingredient {
  const unparsed: Ingredient = {
    text,
    title,
    quantity: null,
    unit: null,
    food: null,
    note: null,
  };
  const match = text
    .trim()
    .match(
      /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?\s*[¼½¾⅓⅔⅛⅜⅝⅞]?|[¼½¾⅓⅔⅛⅜⅝⅞])\s*(.*)$/,
    );
  if (!match) {
    return unparsed;
  }
  const amount = match[1].trim();
  const rest = match[2].trim();
  // Ranges, sums, and alternative amounts stay verbatim rather than guessing.
  if (!rest || /\d|[¼½¾⅓⅔⅛⅜⅝⅞+–—]/.test(rest) || rest.startsWith('-')) {
    return unparsed;
  }
  const unicode = amount.match(/[¼½¾⅓⅔⅛⅜⅝⅞]$/)?.[0];
  const fraction = amount.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  const quantity = unicode
    ? Number(amount.slice(0, -1).trim() || 0) + FRACTIONS[unicode]
    : fraction
      ? Number(fraction[1] ?? 0) + Number(fraction[2]) / Number(fraction[3])
      : Number(amount);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return unparsed;
  }
  const unit = rest.match(UNITS);
  const foodAndNote = (unit ? rest.slice(unit[0].length) : rest).trim();
  const [food, ...notes] = foodAndNote.split(',');
  if (!food?.trim()) {
    return unparsed;
  }
  return {
    text,
    title,
    quantity,
    unit: unit?.[1] ?? null,
    food: food.trim(),
    note: notes.join(',').trim() || null,
  };
}
