import type { RecipeContent } from '@scran/shared';

import { scaledIngredient } from './recipe-logic';
import { Button, ChoiceChip } from './ui';

export function IngredientsPanel({
  content,
  factor,
  onFactor,
}: {
  content: RecipeContent;
  factor: number;
  onFactor: (factor: number) => void;
}) {
  return (
    <>
      <Scaler
        yieldQuantity={content.yieldQuantity}
        yieldUnit={content.yieldUnit}
        recipeYield={content.recipeYield}
        factor={factor}
        onFactor={onFactor}
      />
      <ul className="mt-4">
        {content.ingredients.map(line => {
          const scaled = scaledIngredient(line, factor);
          const unscaled =
            factor !== 1 &&
            (line.quantity === null || /\d/.test(line.note ?? ''));
          return (
            <li
              key={`${line.title ?? ''}:${line.text}`}
              className="border-line border-b py-3"
            >
              {line.title && (
                <h3 className="type-label text-ink-muted mb-1 font-bold uppercase">
                  {line.title}
                </h3>
              )}
              <p className="type-body">
                {scaled}
                {unscaled && (
                  <span className="type-label text-ink-muted ml-2">
                    unscaled
                  </span>
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Scaler({
  yieldQuantity,
  yieldUnit,
  recipeYield,
  factor,
  onFactor,
}: {
  yieldQuantity: number | null;
  yieldUnit: string | null;
  recipeYield: string | null;
  factor: number;
  onFactor: (factor: number) => void;
}) {
  if (yieldQuantity) {
    const servings = Math.max(1, Math.round(yieldQuantity * factor));
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="type-label text-ink-muted">
          {recipeYield?.match(/serv/i) ? 'Serves' : 'Makes'}
        </span>
        <div className="rounded-ui border-line ml-auto flex items-center border">
          <Button
            variant="quiet"
            size="compact"
            aria-label="One fewer"
            disabled={servings <= 1}
            onClick={() => onFactor(Math.max(1, servings - 1) / yieldQuantity)}
          >
            −
          </Button>
          <span className="type-control min-w-8 text-center font-semibold tabular-nums">
            {servings}
            {!recipeYield?.match(/serv/i) && yieldUnit ? ` ${yieldUnit}` : ''}
          </span>
          <Button
            variant="quiet"
            size="compact"
            aria-label="One more"
            onClick={() => onFactor((servings + 1) / yieldQuantity)}
          >
            +
          </Button>
        </div>
        {factor !== 1 && (
          <Button variant="quiet" size="compact" onClick={() => onFactor(1)}>
            Reset
          </Button>
        )}
      </div>
    );
  }

  return (
    <div>
      {recipeYield && (
        <p className="type-label text-ink-muted mb-2">{recipeYield}</p>
      )}
      <div className="flex gap-2">
        {[0.5, 1, 2, 3].map(value => (
          <ChoiceChip
            kind="choice"
            key={value}
            selected={factor === value}
            onClick={() => onFactor(value)}
          >
            ×{value}
          </ChoiceChip>
        ))}
      </div>
    </div>
  );
}
