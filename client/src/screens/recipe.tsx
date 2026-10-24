import { recipeContentSchema } from '@scran/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';

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
import { IngredientsPanel } from '../ingredients-panel';
import { RecipeMenu } from '../recipe-menu';
import { ScreenAwakeToggle } from '../screen-awake-toggle';
import {
  Button,
  ButtonLink,
  Dialog,
  EmptyState,
  Feedback,
  Field,
  PersistentDrawer,
  Section,
} from '../ui';
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
    return <State title="That recipe does not exist." />;
  }
  if (recipe.isPending) {
    return <State title="Loading recipe…" />;
  }
  if (recipe.error) {
    return (
      <State title="Couldn’t load this recipe">{recipe.error.message}</State>
    );
  }
  if (recipe.data.status === 'pending' && !recipe.data.version) {
    return (
      <State title="Reading the source…">
        Your recipe will appear here when it’s ready.
      </State>
    );
  }
  if (recipe.data.status === 'failed' && !recipe.data.version) {
    const noRecipe = recipe.data.failureReason === 'no_recipe';
    return (
      <State
        title={noRecipe ? 'No recipe found' : 'We couldn’t read this recipe'}
      >
        <p className="mx-auto max-w-sm">
          {noRecipe
            ? 'Try a clear photo of a recipe page showing the ingredients or method. A photo of a dish on its own isn’t enough.'
            : 'Something went wrong while reading the source. It’s saved, so you can try again.'}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {recipe.data.sources.map((source, index) =>
            source.kind === 'photo' ? (
              <a key={source.id} href={`/api/photos/${source.id}`}>
                <img
                  src={`/api/photos/${source.id}`}
                  alt={`Source photo ${index + 1}`}
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
          <ButtonLink to="/capture">Try another source</ButtonLink>
          <Button
            variant="secondary"
            loading={retry.isPending}
            disabled={remove.isPending}
            onClick={() => retry.mutate()}
          >
            {retry.isPending ? 'Retrying…' : 'Try reading again'}
          </Button>
          {recipe.data.createdByUserId === session.data?.user.id && (
            <Button
              variant="destructive"
              loading={remove.isPending}
              disabled={retry.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? 'Removing…' : 'Remove upload'}
            </Button>
          )}
        </div>
        {(retry.error || remove.error) && (
          <Feedback tone="error">
            {retry.error?.message ?? remove.error?.message}
          </Feedback>
        )}
      </State>
    );
  }

  const version = recipe.data.version;
  if (!version) {
    return <State title="This recipe has no version." />;
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
    <main className="drawer-layout mx-auto max-w-2xl lg:grid lg:h-dvh lg:max-w-6xl lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] lg:overflow-hidden lg:pb-0">
      <article className="px-4 pt-4 pb-8 lg:col-start-2 lg:row-start-1 lg:h-dvh lg:overflow-y-auto lg:px-8 lg:pt-8">
        <div className="flex items-center justify-between gap-4">
          <ButtonLink to="/" variant="quiet" size="compact">
            ← All recipes
          </ButtonLink>
          <div className="flex items-center gap-1">
            <ScreenAwakeToggle />
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
        </div>
        <Dialog
          open={action === 'delete' || action === 'reread'}
          title={
            action === 'delete'
              ? 'Delete this recipe?'
              : 'Read the source again?'
          }
          onClose={() => setAction(null)}
          busy={remove.isPending || readAgain.isPending}
          footer={
            <>
              <Button
                variant="quiet"
                disabled={remove.isPending || readAgain.isPending}
                onClick={() => setAction(null)}
              >
                Cancel
              </Button>
              <Button
                variant={action === 'delete' ? 'destructive' : 'primary'}
                loading={remove.isPending || readAgain.isPending}
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
            </>
          }
        >
          <p>
            {action === 'delete'
              ? `“${version.name}” will be removed from the household’s catalogue.`
              : 'All saved photos, in reading order, or the saved webpage will be read again. A successful reading replaces the current content, including any edits. Previous versions are kept; if reading fails, this recipe stays as it is.'}
          </p>
          {(action === 'delete' ? remove.error : readAgain.error) && (
            <Feedback tone="error">
              {action === 'delete'
                ? remove.error?.message
                : readAgain.error?.message}
            </Feedback>
          )}
        </Dialog>
        {recipe.data.status === 'pending' && (
          <div className="my-4">
            <Feedback>
              Reading the source again… You can keep using the saved recipe
              below.
            </Feedback>
          </div>
        )}
        {recipe.data.status === 'failed' && (
          <div className="my-4">
            <Feedback>
              {recipe.data.failureReason === 'no_recipe'
                ? 'No readable recipe was found in the source.'
                : 'We couldn’t read the source again.'}{' '}
              Your saved recipe is unchanged.
            </Feedback>
          </div>
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
          <Section title="From the page" reading>
            {version.notes.map(note => (
              <p
                key={`${note.title ?? ''}:${note.text}`}
                className="type-body mt-2"
              >
                {note.title && <strong>{note.title}: </strong>}
                {note.text}
              </p>
            ))}
          </Section>
        )}

        <Section
          title="What the house says"
          reading
          description="Your rating: ✗ don’t make again · ✓ make again · ✓✓ cook for guests"
        >
          <div className="flex gap-2">
            {([1, 2, 3] as const).map(score => (
              <button
                key={score}
                type="button"
                aria-label={`Rate ${score} of 3: ${score === 1 ? 'Don’t make again' : score === 2 ? 'Make again' : 'Cook for guests'}`}
                aria-pressed={ownRating === score}
                disabled={rating.isPending}
                onClick={() => rating.mutate(score)}
                className={`type-control rounded-ui min-h-12 flex-1 border py-3 disabled:opacity-50 ${ownRating === score ? 'border-selection-line bg-selection text-ink' : 'border-line hover:bg-panel'}`}
              >
                {GLYPH[score]}
              </button>
            ))}
          </div>
          {rating.error && (
            <Feedback tone="error">{rating.error.message}</Feedback>
          )}
          <div className="mt-6 space-y-3">
            {recipe.data.comments.map(item => (
              <p key={item.id} className="type-body">
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
            <Field
              label="Add a comment"
              hideLabel
              className="flex-1"
              placeholder="Add a comment…"
              {...comment.register('body', { required: true })}
            />
            <Button type="submit" loading={addComment.isPending}>
              Post
            </Button>
          </form>
          {addComment.error && (
            <Feedback tone="error">{addComment.error.message}</Feedback>
          )}
        </Section>

        {recipe.data.sources.length > 0 && (
          <Section title="Source" reading>
            <div className="flex flex-wrap gap-3">
              {recipe.data.sources.map((source, index) =>
                source.kind === 'photo' ? (
                  <a key={source.id} href={`/api/photos/${source.id}`}>
                    <img
                      src={`/api/photos/${source.id}`}
                      alt={`Source photo ${index + 1}`}
                      className="rounded-ui border-line h-28 w-24 border object-contain opacity-70"
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
          </Section>
        )}
      </article>

      <PersistentDrawer
        title="Ingredients"
        summary={`${version.ingredients.length} lines`}
        open={ingredientsOpen}
        onOpenChange={setIngredientsOpen}
      >
        <IngredientsPanel
          content={recipeContentSchema.parse(version)}
          factor={factor}
          onFactor={setFactor}
        />
      </PersistentDrawer>
    </main>
  );
}

function State({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="grid min-h-dvh items-center">
      <EmptyState
        title={title}
        actions={
          <ButtonLink to="/" variant="quiet">
            ← All recipes
          </ButtonLink>
        }
      >
        {children}
      </EmptyState>
    </main>
  );
}
