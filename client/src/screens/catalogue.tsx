import { TAGS, type TagId } from '@scran/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';

import { listRecipes, type RecipeSummary, recipeKeys } from '../api/recipes';
import { authClient } from '../auth';
import { useCatalogueViewport } from '../catalogue-viewport';
import { aggregate, matchesSpeed, type Speed } from '../recipe-logic';
import {
  Button,
  ButtonLink,
  ChoiceChip,
  Dialog,
  EmptyState,
  Feedback,
  Field,
  PageHeader,
  Section,
} from '../ui';

type Sort = 'recent' | 'name' | 'quickest';
type Floor = '2' | '3';

const GLYPH = { 1: '✗', 2: '✓', 3: '✓✓' } as const;
const SORT_LABEL: Record<Sort, string> = {
  recent: 'Recently added',
  name: 'Name',
  quickest: 'Quickest',
};
const SPEED_LABEL: Record<Speed, string> = {
  'under-30': 'Under 30 min',
  '30-60': '30–60 min',
  'over-60': 'Over an hour',
};

export function Catalogue() {
  const viewportRef = useCatalogueViewport();
  const session = authClient.useSession();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const sort = readOption(params.get('sort'), ['recent', 'name', 'quickest']);
  const speed = readOption(params.get('speed'), [
    'under-30',
    '30-60',
    'over-60',
  ]);
  const scope = readOption(params.get('scope'), ['everyone', 'me']);
  const floor = readOption(params.get('rating'), ['2', '3']);
  const tags = TAGS.map(tag => tag.id).filter(tag =>
    params.getAll('tag').includes(tag),
  );
  const sheet = params.get('filters') === 'open';
  const recipes = useQuery({
    queryKey: recipeKeys.list(query),
    queryFn: () => listRecipes(query),
  });

  const update = (key: string, value?: string) => {
    const next = new URLSearchParams(params);
    next.delete(key);
    if (value) {
      next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  const toggleTag = (tag: TagId) => {
    const next = new URLSearchParams(params);
    next.delete('tag');
    for (const value of tags.includes(tag)
      ? tags.filter(item => item !== tag)
      : [...tags, tag]) {
      next.append('tag', value);
    }
    setParams(next, { replace: true });
  };

  const visible = [...(recipes.data ?? [])]
    .filter(recipe => tags.every(tag => recipe.tags.includes(tag)))
    .filter(recipe => matchesSpeed(recipe, speed))
    .filter(recipe => {
      if (!floor) {
        return true;
      }
      const mark = aggregate(recipe, scope, session.data?.user.id ?? '');
      return mark !== undefined && mark >= floorScore(floor);
    })
    .sort((a, b) => compare(a, b, sort));

  const usage = [...TAGS].sort(
    (a, b) =>
      (recipes.data?.filter(recipe => recipe.tags.includes(b.id)).length ?? 0) -
      (recipes.data?.filter(recipe => recipe.tags.includes(a.id)).length ?? 0),
  );

  const active =
    tags.length +
    Number(Boolean(speed)) +
    Number(Boolean(floor)) +
    Number(scope === 'me') +
    Number(Boolean(sort));

  const controls = (
    <div className="flex gap-2">
      <Field
        label="Search recipes"
        hideLabel
        type="search"
        className="flex-1"
        value={query}
        onChange={event => update('q', event.target.value)}
        placeholder="Search recipes and ingredients…"
      />
      <Button variant="secondary" onClick={() => update('filters', 'open')}>
        Filter{active ? ` · ${active}` : ''}
      </Button>
    </div>
  );

  return (
    <main
      ref={viewportRef}
      className="catalogue-shell mx-auto w-full max-w-3xl md:pb-8"
    >
      <div className="catalogue-results">
        <div className="md:border-line md:bg-background/95 px-4 pt-6 md:sticky md:top-0 md:z-10 md:border-b md:pb-3 md:backdrop-blur">
          <PageHeader
            title="scran"
            actions={
              <>
                <span className="type-label text-ink-muted">
                  {visible.length} {visible.length === 1 ? 'recipe' : 'recipes'}
                </span>
                <ButtonLink to="/account" variant="quiet" size="compact">
                  Account
                </ButtonLink>
                <span className="hidden md:block">
                  <ButtonLink to="/capture">+ Add recipe</ButtonLink>
                </span>
              </>
            }
          />
          <div className="mt-3 hidden md:block">{controls}</div>
        </div>

        {active > 0 && (
          <div className="flex gap-2 overflow-x-auto px-4 py-3">
            {sort && (
              <ChoiceChip
                kind="removable"
                removeLabel={`Remove ${SORT_LABEL[sort]} sort`}
                onRemove={() => update('sort')}
              >
                {SORT_LABEL[sort]}
              </ChoiceChip>
            )}
            {scope === 'me' && (
              <ChoiceChip
                kind="removable"
                removeLabel="Remove my ratings filter"
                onRemove={() => update('scope')}
              >
                Me
              </ChoiceChip>
            )}
            {speed && (
              <ChoiceChip
                kind="removable"
                removeLabel="Remove time filter"
                onRemove={() => update('speed')}
              >
                {SPEED_LABEL[speed]}
              </ChoiceChip>
            )}
            {floor && (
              <ChoiceChip
                kind="removable"
                removeLabel="Remove minimum rating"
                onRemove={() => update('rating')}
              >
                {GLYPH[floorScore(floor)]}+
              </ChoiceChip>
            )}
            {tags.map(tag => (
              <ChoiceChip
                kind="removable"
                key={tag}
                removeLabel={`Remove ${tag} filter`}
                onRemove={() => toggleTag(tag)}
              >
                {TAGS.find(item => item.id === tag)?.label}
              </ChoiceChip>
            ))}
          </div>
        )}

        {recipes.isPending && (
          <div className="p-4">
            <Feedback>Loading recipes…</Feedback>
          </div>
        )}
        {recipes.error && (
          <EmptyState
            title="Couldn’t load recipes"
            tone="error"
            actions={
              <Button
                variant="secondary"
                onClick={() => void recipes.refetch()}
              >
                Try again
              </Button>
            }
          >
            {recipes.error.message}
          </EmptyState>
        )}
        {!recipes.isPending && !recipes.error && (
          <ul>
            {visible.map(recipe => {
              const mark = aggregate(
                recipe,
                scope,
                session.data?.user.id ?? '',
              );
              return (
                <li key={recipe.id}>
                  <Link
                    to={`/recipes/${recipe.id}`}
                    className="border-line hover:bg-panel flex min-h-20 items-center gap-4 border-b px-4 py-4 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="type-body font-semibold break-words">
                        {recipe.name ?? statusName(recipe)}
                      </p>
                      <div className="type-label text-ink-muted mt-1 break-words">
                        {summary(recipe) && <>{summary(recipe)} · </>}
                        <span>
                          Added by{' '}
                          {recipe.createdByUserId === session.data?.user.id
                            ? 'you'
                            : recipe.createdByUserName?.trim() ||
                              'a household member'}
                        </span>
                      </div>
                      {recipe.tags.length > 0 && (
                        <p className="type-label text-ink-muted mt-1 truncate">
                          {recipe.tags.join(' · ')}
                        </p>
                      )}
                    </div>
                    {mark && (
                      <span
                        className={`type-body shrink-0 ${mark === 1 ? 'text-danger' : 'text-success'}`}
                      >
                        {GLYPH[mark]}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
            {visible.length === 0 && (
              <li>
                <EmptyState
                  title={
                    query || active
                      ? 'No matching recipes'
                      : 'Your cookbook starts here'
                  }
                  actions={
                    query || active ? (
                      <Button
                        variant="secondary"
                        onClick={() => setParams(new URLSearchParams())}
                      >
                        Clear search and filters
                      </Button>
                    ) : (
                      <ButtonLink to="/capture">Add a recipe</ButtonLink>
                    )
                  }
                >
                  {query || active
                    ? 'Try a different search or fewer filters.'
                    : 'Photograph a cookbook page or paste a recipe URL.'}
                </EmptyState>
              </li>
            )}
          </ul>
        )}
      </div>
      <div className="catalogue-controls bottom-safe border-line bg-panel z-20 shrink-0 border-t px-4 pt-3 md:hidden">
        {controls}
      </div>
      <div className="catalogue-add absolute right-4 bottom-24 z-30 md:hidden">
        <ButtonLink to="/capture" aria-label="Add a recipe">
          + Add recipe
        </ButtonLink>
      </div>

      <Dialog
        open={sheet}
        title="Filter & sort"
        onClose={() => update('filters')}
        actions={
          <Button
            variant="quiet"
            size="compact"
            onClick={() => {
              const next = new URLSearchParams();
              if (query) {
                next.set('q', query);
              }
              next.set('filters', 'open');
              setParams(next, { replace: true });
            }}
          >
            Clear all
          </Button>
        }
        footer={
          <Button className="w-full" onClick={() => update('filters')}>
            Show {visible.length} {visible.length === 1 ? 'recipe' : 'recipes'}
          </Button>
        }
      >
        <div className="space-y-6">
          <FilterGroup title="Sort by">
            {(Object.keys(SORT_LABEL) as Sort[]).map(value => (
              <Chip
                key={value}
                active={sort === value || (!sort && value === 'recent')}
                onClick={() =>
                  update('sort', value === 'recent' ? undefined : value)
                }
              >
                {SORT_LABEL[value]}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup title="Whose ratings">
            <Chip active={scope !== 'me'} onClick={() => update('scope')}>
              Everyone
            </Chip>
            <Chip active={scope === 'me'} onClick={() => update('scope', 'me')}>
              Me
            </Chip>
          </FilterGroup>
          <FilterGroup title="Time">
            {(Object.keys(SPEED_LABEL) as Speed[]).map(value => (
              <Chip
                key={value}
                active={speed === value}
                onClick={() =>
                  update('speed', speed === value ? undefined : value)
                }
              >
                {SPEED_LABEL[value]}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup title="At least">
            {(['2', '3'] as Floor[]).map(value => (
              <Chip
                key={value}
                active={floor === value}
                onClick={() =>
                  update('rating', floor === value ? undefined : value)
                }
              >
                {GLYPH[floorScore(value)]} and up
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup title="Tags">
            {usage.map(tag => (
              <Chip
                key={tag.id}
                active={tags.includes(tag.id)}
                onClick={() => toggleTag(tag.id)}
              >
                {tag.label}
              </Chip>
            ))}
          </FilterGroup>
        </div>
      </Dialog>
    </main>
  );
}

function readOption<const Value extends string>(
  value: string | null,
  options: readonly Value[],
): Value | undefined {
  return options.find(option => option === value);
}

function floorScore(floor: Floor): 2 | 3 {
  return floor === '2' ? 2 : 3;
}

function compare(a: RecipeSummary, b: RecipeSummary, sort?: Sort): number {
  if (sort === 'name') {
    return (a.name ?? '').localeCompare(b.name ?? '');
  }
  if (sort === 'quickest') {
    return (
      (a.totalMinutes ?? Number.POSITIVE_INFINITY) -
      (b.totalMinutes ?? Number.POSITIVE_INFINITY)
    );
  }
  if (sort === 'recent') {
    return b.createdAt.localeCompare(a.createdAt);
  }
  return 0;
}

function summary(recipe: RecipeSummary): string {
  if (recipe.status !== 'ready') {
    if (recipe.name && recipe.status === 'failed') {
      return 'Reading failed · saved recipe kept';
    }
    if (recipe.failureReason === 'no_recipe') {
      return 'Try a photo of a recipe page';
    }
    return recipe.status === 'pending'
      ? 'Reading source…'
      : 'Extraction failed';
  }
  const time = recipe.totalMinutes
    ? `${recipe.timeEstimated ? '~' : ''}${recipe.totalMinutes} min`
    : null;
  return time ?? '';
}

function statusName(recipe: RecipeSummary): string {
  if (recipe.failureReason === 'no_recipe') {
    return 'No recipe found';
  }
  return recipe.status === 'pending' ? 'New recipe' : 'Unread recipe';
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Section title={title}>
      <div className="flex flex-wrap gap-2">{children}</div>
    </Section>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <ChoiceChip kind="choice" selected={active} onClick={onClick}>
      {children}
    </ChoiceChip>
  );
}
