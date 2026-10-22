import { recipeContentSchema } from '@scran/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';

import {
  commentOnRecipe,
  deleteRecipe,
  rateRecipe,
  recipeKeys,
  recipeOptions,
  retryRecipe,
  rereadRecipe,
} from '../api/recipes';
import { authClient } from '../auth';
import { scaledIngredient } from '../recipe-logic';
import { RecipeMenu } from '../recipe-menu';
import { Button, Modal } from '../ui';
import { RecipeEditor } from './recipe-editor';

const GLYPH = { 1: '✗', 2: '✓', 3: '✓✓' } as const;

export function Recipe() {
  const navigate = useNavigate();
  const id = Number(useParams().id);
  const session = authClient.useSession();
  const queryClient = useQueryClient();
  const recipe = useQuery({
    ...recipeOptions(id),
    enabled: Number.isInteger(id) && id > 0,
  });
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [action, setAction] = useState<'edit' | 'reread' | 'delete' | null>(
    null,
  );
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

  const remove = useMutation({
    mutationFn: () => deleteRecipe(id),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: recipeKeys.detail(id) });
      await queryClient.invalidateQueries({
        queryKey: recipeKeys.all,
        refetchType: 'none',
      });
      await navigate('/');
    },
  });

  const readAgain = useMutation({
    mutationFn: () => rereadRecipe(id),
    onSuccess: async () => {
      setAction(null);
      await refresh();
    },
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
  if (recipe.data.status === 'pending' && !recipe.data.version) {
    return <State>Reading the source…</State>;
  }
  if (recipe.data.status === 'failed' && !recipe.data.version) {
    const noRecipe = recipe.data.failureReason === 'no_recipe';
    return (
      <State>
        <h1 className="type-title text-ink font-bold">
          {noRecipe ? 'No recipe found' : 'We couldn’t read this recipe'}
        </h1>
        <p className="mx-auto max-w-sm">
          {noRecipe
            ? 'Try a clear photo of a recipe page showing the ingredients or method. A photo of a dish on its own isn’t enough.'
            : 'Something went wrong while reading the source. It’s saved, so you can try again.'}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {recipe.data.sources.map(source =>
            source.kind === 'photo' ? (
              <a key={source.id} href={`/api/photos/${source.id}`}>
                <img
                  src={`/api/photos/${source.id}`}
                  alt="Uploaded source"
                  className="rounded-ui border-line h-40 w-40 border object-contain"
                />
              </a>
            ) : (
              <a
                key={source.id}
                href={source.url ?? '#'}
                className="text-accent underline"
              >
                View original webpage
              </a>
            ),
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/capture"
            className="rounded-pill bg-accent text-accent-ink inline-flex min-h-11 items-center px-4 font-semibold"
          >
            Try another source
          </Link>
          <button
            type="button"
            disabled={retry.isPending || remove.isPending}
            onClick={() => retry.mutate()}
            className="text-accent min-h-11 px-3 underline disabled:opacity-50"
          >
            {retry.isPending ? 'Retrying…' : 'Try reading again'}
          </button>
          {recipe.data.createdByUserId === session.data?.user.id && (
            <button
              type="button"
              disabled={remove.isPending || retry.isPending}
              onClick={() => remove.mutate()}
              className="text-danger min-h-11 px-3 underline disabled:opacity-50"
            >
              {remove.isPending ? 'Removing…' : 'Remove upload'}
            </button>
          )}
        </div>
        {(retry.error || remove.error) && (
          <p role="alert" className="text-danger">
            {retry.error?.message ?? remove.error?.message}
          </p>
        )}
      </State>
    );
  }

  const version = recipe.data.version;
  if (!version) {
    return <State>This recipe has no version.</State>;
  }

  if (action === 'edit') {
    return (
      <RecipeEditor
        id={id}
        content={recipeContentSchema.parse(version)}
        tags={recipe.data.tags}
        onClose={() => {
          setAction(null);
          setFactor(1);
        }}
      />
    );
  }

  const ownRating = recipe.data.ratings.find(
    item => item.userId === session.data?.user.id,
  )?.score;

  return (
    <main className="bottom-sheet-clearance mx-auto max-w-2xl lg:grid lg:h-dvh lg:max-w-6xl lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] lg:overflow-hidden lg:pb-0">
      <article className="px-4 pt-4 lg:col-start-2 lg:row-start-1 lg:h-dvh lg:overflow-y-auto lg:px-8 lg:pt-8">
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/"
            className="text-ink-muted inline-flex min-h-11 items-center"
          >
            ← All recipes
          </Link>
          <RecipeMenu
            disabled={
              recipe.data.status === 'pending' ||
              remove.isPending ||
              readAgain.isPending
            }
            canRead={recipe.data.sources.length > 0}
            onEdit={() => setAction('edit')}
            onRead={() => setAction('reread')}
            onDelete={
              recipe.data.createdByUserId === session.data?.user.id
                ? () => setAction('delete')
                : null
            }
          />
        </div>
        <Modal
          open={action === 'delete' || action === 'reread'}
          label={action === 'delete' ? 'Delete recipe' : 'Read source again'}
          onClose={() => setAction(null)}
        >
          <div className="space-y-4 p-6">
            <h2 className="type-title font-bold">
              {action === 'delete'
                ? 'Delete this recipe?'
                : 'Read the source again?'}
            </h2>
            <p>
              {action === 'delete'
                ? `“${version.name}” will be removed from the household’s catalogue.`
                : 'The saved photo or webpage will be read again. A successful reading replaces the current content, including any edits. Previous versions are kept; if reading fails, this recipe stays as it is.'}
            </p>
            {(action === 'delete' ? remove.error : readAgain.error) && (
              <p role="alert" className="text-danger">
                {action === 'delete'
                  ? remove.error?.message
                  : readAgain.error?.message}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={remove.isPending || readAgain.isPending}
                onClick={() => setAction(null)}
                className="text-ink-muted min-h-11 px-4 underline disabled:opacity-50"
              >
                Cancel
              </button>
              <Button
                type="button"
                disabled={remove.isPending || readAgain.isPending}
                onClick={() =>
                  action === 'delete' ? remove.mutate() : readAgain.mutate()
                }
              >
                {action === 'delete'
                  ? remove.isPending
                    ? 'Deleting…'
                    : 'Delete recipe'
                  : readAgain.isPending
                    ? 'Starting…'
                    : 'Read source again'}
              </Button>
            </div>
          </div>
        </Modal>
        {recipe.data.status === 'pending' && (
          <p
            role="status"
            className="rounded-ui border-line bg-panel my-4 border p-4"
          >
            Reading the source again… You can keep using the saved recipe below.
          </p>
        )}
        {recipe.data.status === 'failed' && (
          <p
            role="status"
            className="rounded-ui border-line bg-panel my-4 border p-4"
          >
            {recipe.data.failureReason === 'no_recipe'
              ? 'No readable recipe was found in the source.'
              : 'We couldn’t read the source again.'}{' '}
            Your saved recipe is unchanged.
          </p>
        )}
        <h1 className="type-title font-bold">{version.name}</h1>
        <p className="type-label text-ink-muted mt-2">
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
          <p className="type-label text-ink-muted mt-1">
            {recipe.data.tags.join(' · ')}
          </p>
        )}

        <ol className="mt-8 space-y-8">
          {version.instructions.map((step, index) => (
            <li key={`${step.title ?? ''}:${step.text}`}>
              <div className="mb-2 flex items-center gap-3">
                <span className="type-label text-accent font-bold uppercase">
                  Step {index + 1}
                </span>
                <span className="bg-line h-px flex-1" />
              </div>
              {step.title && (
                <h2 className="type-label text-ink-muted mb-1 font-bold uppercase">
                  {step.title}
                </h2>
              )}
              <p className="type-body">{step.text}</p>
            </li>
          ))}
        </ol>

        {version.notes.length > 0 && (
          <section>
            <Heading>From the page</Heading>
            {version.notes.map(note => (
              <p key={`${note.title ?? ''}:${note.text}`} className="mt-2">
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
                className={`type-body rounded-ui min-h-12 flex-1 border-2 py-3 ${ownRating === score ? 'border-accent bg-accent text-accent-ink' : 'border-line'}`}
              >
                {GLYPH[score]}
              </button>
            ))}
          </div>
          {rating.error && (
            <p className="type-label text-danger mt-2">
              {rating.error.message}
            </p>
          )}
          <div className="mt-6 space-y-3">
            {recipe.data.comments.map(item => (
              <p key={item.id}>
                “{item.body}”
                <span className="type-label text-ink-muted">
                  {' '}
                  — {item.userName}
                </span>
              </p>
            ))}
          </div>
          <form
            className="mt-4 flex gap-2"
            onSubmit={event =>
              void comment.handleSubmit(values =>
                addComment.mutate(values.body),
              )(event)
            }
          >
            <input
              aria-label="Add a comment"
              placeholder="Add a comment…"
              className="rounded-pill border-line bg-background focus:border-accent min-h-11 min-w-0 flex-1 border px-4 outline-none"
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
                      className="rounded-ui border-line h-28 w-24 border object-cover opacity-70"
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
        className={`rounded-t-sheet border-line bg-panel shadow-card fixed inset-x-0 bottom-0 z-20 mx-auto h-[82dvh] max-w-2xl border-t transition-transform duration-300 lg:static lg:col-start-1 lg:row-start-1 lg:flex lg:h-dvh lg:max-w-none lg:translate-y-0 lg:flex-col lg:rounded-none lg:border-0 lg:border-r lg:shadow-none ${ingredientsOpen ? 'translate-y-0' : 'translate-y-[calc(100%-4.5rem)]'}`}
      >
        <button
          type="button"
          onClick={() => setIngredientsOpen(open => !open)}
          aria-expanded={ingredientsOpen}
          className="w-full px-6 pt-3 pb-2 lg:hidden"
        >
          <span className="rounded-pill bg-line mx-auto mb-3 block h-1 w-10" />
          <span className="flex items-baseline gap-3">
            <span className="type-body font-bold">Ingredients</span>
            <span className="type-label text-ink-muted">
              {version.ingredients.length} lines
            </span>
            <span className="type-body text-accent ml-auto">
              {ingredientsOpen ? '⌄' : '⌃'}
            </span>
          </span>
        </button>
        <div className="bottom-clearance max-h-[calc(82dvh-6rem)] overflow-y-auto px-6 lg:max-h-none lg:flex-1 lg:py-8">
          <h2 className="type-title mb-6 hidden font-bold lg:block">
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
        <span className="type-label text-ink-muted">
          {recipeYield?.match(/serv/i) ? 'Serves' : 'Makes'}
        </span>
        <div className="rounded-pill border-line ml-auto flex items-center gap-1 border-2 p-1">
          <button
            type="button"
            aria-label="One fewer"
            disabled={servings <= 1}
            onClick={() => onFactor(Math.max(1, servings - 1) / yieldQuantity)}
            className="type-body rounded-pill h-11 w-11 disabled:opacity-30"
          >
            −
          </button>
          <span className="type-body min-w-12 text-center font-bold tabular-nums">
            {servings}
            {!recipeYield?.match(/serv/i) && yieldUnit ? ` ${yieldUnit}` : ''}
          </span>
          <button
            type="button"
            aria-label="One more"
            onClick={() => onFactor((servings + 1) / yieldQuantity)}
            className="type-body rounded-pill h-11 w-11"
          >
            +
          </button>
        </div>
        <button
          type="button"
          onClick={() => onFactor(1)}
          className={`type-label text-accent min-h-11 ${factor === 1 ? 'invisible' : ''}`}
        >
          reset
        </button>
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
          <button
            key={value}
            type="button"
            onClick={() => onFactor(value)}
            className={`rounded-ui min-h-11 flex-1 border-2 ${factor === value ? 'border-accent bg-accent text-accent-ink' : 'border-line'}`}
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
    <div className="mt-12 mb-3 flex items-center gap-3">
      <h2 className="type-label text-ink-muted font-bold uppercase">
        {children}
      </h2>
      <span className="bg-line h-px flex-1" />
    </div>
  );
}

function State({ children }: { children: React.ReactNode }) {
  return (
    <main className="text-ink-muted grid min-h-dvh place-items-center gap-4 p-6 text-center">
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
