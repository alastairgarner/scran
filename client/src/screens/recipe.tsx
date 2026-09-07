import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import {
  commentOnRecipe,
  rateRecipe,
  recipeKeys,
  recipeOptions,
  retryRecipe,
} from '../api/recipes';
import { authClient } from '../auth';
import { scaledIngredient } from '../recipe-logic';
import { Button } from '../ui';

const GLYPH = { 1: '✗', 2: '✓', 3: '✓✓' } as const;

export function Recipe() {
  const id = Number(useParams().id);
  const session = authClient.useSession();
  const queryClient = useQueryClient();
  const recipe = useQuery({
    ...recipeOptions(id),
    enabled: Number.isInteger(id) && id > 0,
  });
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [factor, setFactor] = useState(1);
  const comment = useForm<{ body: string }>();

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: recipeKeys.detail(id) });
    await queryClient.invalidateQueries({ queryKey: recipeKeys.all });
  };

  const rating = useMutation({
    mutationFn: (score: 1 | 2 | 3) => rateRecipe(id, score),
    onSuccess: refresh,
  });

  const addComment = useMutation({
    mutationFn: (body: string) => commentOnRecipe(id, body),
    onSuccess: async () => {
      comment.reset();
      await refresh();
    },
  });

  const retry = useMutation({
    mutationFn: () => retryRecipe(id),
    onSuccess: refresh,
  });

  if (!Number.isInteger(id) || id < 1) {
    return <State>That recipe does not exist.</State>;
  }
  if (recipe.isPending) {
    return <State>Loading recipe…</State>;
  }
  if (recipe.error) {
    return <State>{recipe.error.message}</State>;
  }
  if (recipe.data.status === 'pending') {
    return <State>Reading the source…</State>;
  }
  if (recipe.data.status === 'failed') {
    return (
      <State>
        <p>Extraction failed. The source is safe.</p>
        <Button disabled={retry.isPending} onClick={() => retry.mutate()}>
          {retry.isPending ? 'Retrying…' : 'Try again'}
        </Button>
      </State>
    );
  }

  const version = recipe.data.version;
  if (!version) {
    return <State>This recipe has no version.</State>;
  }

  const ownRating = recipe.data.ratings.find(
    item => item.userId === session.data?.user.id,
  )?.score;

  return (
    <main className="mx-auto max-w-2xl pb-32 lg:grid lg:h-dvh lg:max-w-6xl lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] lg:overflow-hidden lg:pb-0">
      <article className="px-4 pt-4 lg:col-start-2 lg:row-start-1 lg:h-dvh lg:overflow-y-auto lg:px-8 lg:pt-8">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center text-ink-muted"
        >
          ← All recipes
        </Link>
        <h1 className="font-bold font-display text-3xl leading-tight tracking-display">
          {version.name}
        </h1>
        <p className="mt-2 text-ink-muted text-sm">
          {[
            version.prepTime,
            version.performTime,
            version.totalTime ??
              (version.totalMinutes
                ? `${version.timeEstimated ? '~' : ''}${version.totalMinutes} min`
                : null),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {recipe.data.tags.length > 0 && (
          <p className="mt-1 text-ink-muted text-sm">
            {recipe.data.tags.join(' · ')}
          </p>
        )}

        <ol className="mt-8 space-y-7">
          {version.instructions.map((step, index) => (
            <li key={`${step.title ?? ''}:${step.text}`}>
              <div className="mb-2 flex items-center gap-3">
                <span className="font-bold font-display text-accent text-sm uppercase tracking-widest">
                  Step {index + 1}
                </span>
                <span className="h-px flex-1 bg-line" />
              </div>
              {step.title && (
                <h2 className="mb-1 font-bold text-ink-muted text-sm uppercase tracking-wide">
                  {step.title}
                </h2>
              )}
              <p className="text-lg leading-relaxed">{step.text}</p>
            </li>
          ))}
        </ol>

        {version.notes.length > 0 && (
          <section>
            <Heading>From the page</Heading>
            {version.notes.map(note => (
              <p
                key={`${note.title ?? ''}:${note.text}`}
                className="mt-2 leading-relaxed"
              >
                {note.title && <strong>{note.title}: </strong>}
                {note.text}
              </p>
            ))}
          </section>
        )}

        <section>
          <Heading>What the house says</Heading>
          <div className="flex gap-2">
            {([1, 2, 3] as const).map(score => (
              <button
                key={score}
                type="button"
                aria-label={`Rate ${score} of 3`}
                aria-pressed={ownRating === score}
                disabled={rating.isPending}
                onClick={() => rating.mutate(score)}
                className={`min-h-12 flex-1 rounded-ui border-2 py-3 text-xl ${ownRating === score ? 'border-accent bg-accent text-accent-ink' : 'border-line'}`}
              >
                {GLYPH[score]}
              </button>
            ))}
          </div>
          {rating.error && (
            <p className="mt-2 text-sm text-veto">{rating.error.message}</p>
          )}
          <div className="mt-5 space-y-3">
            {recipe.data.comments.map(item => (
              <p key={item.id} className="leading-relaxed">
                “{item.body}”
                <span className="text-ink-muted text-sm">
                  {' '}
                  — {item.userName}
                </span>
              </p>
            ))}
          </div>
          <form
            className="mt-4 flex gap-2"
            onSubmit={comment.handleSubmit(values =>
              addComment.mutate(values.body),
            )}
          >
            <input
              aria-label="Add a comment"
              placeholder="Add a comment…"
              className="min-h-11 min-w-0 flex-1 rounded-pill border border-line bg-surface px-4 outline-none focus:border-accent"
              {...comment.register('body', { required: true })}
            />
            <Button disabled={addComment.isPending}>Post</Button>
          </form>
        </section>

        {recipe.data.sources.length > 0 && (
          <section className="pb-8">
            <Heading>Source</Heading>
            <div className="flex flex-wrap gap-3">
              {recipe.data.sources.map(source =>
                source.kind === 'photo' ? (
                  <a key={source.id} href={`/api/photos/${source.id}`}>
                    <img
                      src={`/api/photos/${source.id}`}
                      alt="The photographed recipe page"
                      className="h-28 w-24 rounded-ui border border-line object-cover opacity-70"
                    />
                  </a>
                ) : (
                  <a
                    key={source.id}
                    href={source.url ?? '#'}
                    className="text-accent underline"
                  >
                    Original webpage
                  </a>
                ),
              )}
            </div>
          </section>
        )}
      </article>

      <section
        className={`fixed inset-x-0 bottom-0 z-20 mx-auto h-[82dvh] max-w-2xl rounded-t-[1.5rem] border-line border-t bg-raised shadow-card transition-transform duration-300 lg:static lg:col-start-1 lg:row-start-1 lg:flex lg:h-dvh lg:max-w-none lg:translate-y-0 lg:flex-col lg:rounded-none lg:border-0 lg:border-r lg:shadow-none ${ingredientsOpen ? 'translate-y-0' : 'translate-y-[calc(100%-4.5rem)]'}`}
      >
        <button
          type="button"
          onClick={() => setIngredientsOpen(open => !open)}
          aria-expanded={ingredientsOpen}
          className="w-full px-5 pt-3 pb-2 lg:hidden"
        >
          <span className="mx-auto mb-3 block h-1 w-10 rounded-pill bg-line" />
          <span className="flex items-baseline gap-3">
            <span className="font-bold font-display text-xl tracking-display">
              Ingredients
            </span>
            <span className="text-ink-muted text-sm">
              {version.ingredients.length} lines
            </span>
            <span className="ml-auto text-accent text-xl">
              {ingredientsOpen ? '⌄' : '⌃'}
            </span>
          </span>
        </button>
        <div className="max-h-[calc(82dvh-6rem)] overflow-y-auto px-5 pb-40 lg:max-h-none lg:flex-1 lg:py-8">
          <h2 className="mb-5 hidden font-bold font-display text-2xl tracking-display lg:block">
            Ingredients
          </h2>
          <Scaler
            yieldQuantity={version.yieldQuantity}
            yieldUnit={version.yieldUnit}
            recipeYield={version.recipeYield}
            factor={factor}
            onFactor={setFactor}
          />
          <ul className="mt-4">
            {version.ingredients.map(line => {
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
                    <h3 className="mb-1 font-bold text-ink-muted text-sm uppercase tracking-wide">
                      {line.title}
                    </h3>
                  )}
                  <p className="text-lg leading-snug">
                    {scaled}
                    {unscaled && (
                      <span className="ml-2 text-ink-muted text-sm">
                        unscaled
                      </span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </main>
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
      <div className="flex items-center gap-3">
        <span className="text-ink-muted text-sm">
          {recipeYield?.match(/serv/i) ? 'Serves' : 'Makes'}
        </span>
        <div className="ml-auto flex items-center gap-1 rounded-pill border-2 border-line p-1">
          <button
            type="button"
            aria-label="One fewer"
            disabled={servings <= 1}
            onClick={() => onFactor(Math.max(1, servings - 1) / yieldQuantity)}
            className="h-11 w-11 rounded-pill text-2xl disabled:opacity-30"
          >
            −
          </button>
          <span className="min-w-12 text-center font-bold text-xl tabular-nums">
            {servings}
            {!recipeYield?.match(/serv/i) && yieldUnit ? ` ${yieldUnit}` : ''}
          </span>
          <button
            type="button"
            aria-label="One more"
            onClick={() => onFactor((servings + 1) / yieldQuantity)}
            className="h-11 w-11 rounded-pill text-2xl"
          >
            +
          </button>
        </div>
        <button
          type="button"
          onClick={() => onFactor(1)}
          className={`min-h-11 text-accent text-sm ${factor === 1 ? 'invisible' : ''}`}
        >
          reset
        </button>
      </div>
    );
  }

  return (
    <div>
      {recipeYield && (
        <p className="mb-2 text-ink-muted text-sm">{recipeYield}</p>
      )}
      <div className="flex gap-2">
        {[0.5, 1, 2, 3].map(value => (
          <button
            key={value}
            type="button"
            onClick={() => onFactor(value)}
            className={`min-h-11 flex-1 rounded-ui border-2 ${factor === value ? 'border-accent bg-accent text-accent-ink' : 'border-line'}`}
          >
            ×{value}
          </button>
        ))}
      </div>
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-10 mb-3 flex items-center gap-3">
      <h2 className="font-bold font-display text-ink-muted text-sm uppercase tracking-widest">
        {children}
      </h2>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function State({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center gap-4 p-6 text-center text-ink-muted">
      <div className="space-y-4">
        {children}
        <p>
          <Link to="/" className="text-accent underline">
            All recipes
          </Link>
        </p>
      </div>
    </main>
  );
}
