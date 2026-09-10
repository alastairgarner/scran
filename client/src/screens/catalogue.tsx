import { TAGS, type TagId } from '@scran/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';

import { listRecipes, type RecipeSummary, recipeKeys } from '../api/recipes';
import { authClient } from '../auth';
import { aggregate, matchesSpeed, type Speed } from '../recipe-logic';
import { Modal } from '../ui';

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
      <input
        value={query}
        onChange={event => update('q', event.target.value)}
        placeholder="Search recipes and ingredients…"
        aria-label="Search recipes"
        className="rounded-pill border-line bg-background focus:border-accent min-h-12 min-w-0 flex-1 border px-4 outline-none"
      />
      <button
        type="button"
        onClick={() => update('filters', 'open')}
        className={`rounded-pill min-h-12 border-2 px-4 font-semibold ${active ? 'border-accent bg-accent text-accent-ink' : 'border-line text-ink-muted'}`}
      >
        Filter{active ? ` · ${active}` : ''}
      </button>
    </div>
  );

  return (
    <main className="bottom-clearance mx-auto max-w-3xl md:pb-8">
      <header className="md:border-line md:bg-background/95 px-4 pt-6 md:sticky md:top-0 md:z-10 md:border-b md:pb-3 md:backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <h1 className="type-title font-bold">scran</h1>
          <span className="type-label text-ink-muted ml-auto">
            {visible.length} {visible.length === 1 ? 'recipe' : 'recipes'}
          </span>
          <Link
            to="/capture"
            className="rounded-pill bg-accent text-accent-ink hidden px-4 py-2 font-semibold md:block"
          >
            + Add recipe
          </Link>
        </div>
        <div className="mt-3 hidden md:block">{controls}</div>
      </header>

      {active > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 py-3">
          {sort && (
            <ActiveChip onClick={() => update('sort')}>
              {SORT_LABEL[sort]} ×
            </ActiveChip>
          )}
          {scope === 'me' && (
            <ActiveChip onClick={() => update('scope')}>Me ×</ActiveChip>
          )}
          {speed && (
            <ActiveChip onClick={() => update('speed')}>
              {SPEED_LABEL[speed]} ×
            </ActiveChip>
          )}
          {floor && (
            <ActiveChip onClick={() => update('rating')}>
              {GLYPH[floorScore(floor)]}+ ×
            </ActiveChip>
          )}
          {tags.map(tag => (
            <ActiveChip key={tag} onClick={() => toggleTag(tag)}>
              {TAGS.find(item => item.id === tag)?.label} ×
            </ActiveChip>
          ))}
        </div>
      )}

      {recipes.isPending && (
        <p className="text-ink-muted p-12 text-center">Loading recipes…</p>
      )}
      {recipes.error && (
        <p className="text-danger p-12 text-center">{recipes.error.message}</p>
      )}
      {!recipes.isPending && !recipes.error && (
        <ul>
          {visible.map(recipe => {
            const mark = aggregate(recipe, scope, session.data?.user.id ?? '');
            return (
              <li key={recipe.id}>
                <Link
                  to={`/recipes/${recipe.id}`}
                  className="border-line flex min-h-20 items-center gap-4 border-b px-4 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="type-body font-semibold">
                      {recipe.name ?? statusName(recipe.status)}
                    </p>
                    <p className="type-label text-ink-muted mt-1 truncate">
                      {summary(recipe)}
                    </p>
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
            <li className="text-ink-muted p-12 text-center">
              Nothing matches.
            </li>
          )}
        </ul>
      )}

      <div className="bottom-safe border-line bg-panel fixed inset-x-0 bottom-0 z-20 border-t px-4 pt-3 md:hidden">
        {controls}
      </div>
      <Link
        to="/capture"
        aria-label="Add a recipe"
        className="type-title rounded-pill bg-accent text-accent-ink shadow-card fixed right-4 bottom-24 z-30 grid h-16 w-16 place-items-center md:hidden"
      >
        +
      </Link>

      <Modal
        open={sheet}
        label="Filter and sort recipes"
        onClose={() => update('filters')}
      >
        <div className="bottom-safe-roomy p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="type-body font-bold">Filter &amp; sort</h2>
            <button
              type="button"
              className="type-label text-ink-muted min-h-11 underline"
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
            </button>
          </div>
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
            <Chip active={scope === 'everyone'} onClick={() => update('scope')}>
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
          <button
            type="button"
            onClick={() => update('filters')}
            className="rounded-pill bg-accent text-accent-ink mt-6 min-h-12 w-full px-4 font-semibold"
          >
            Show {visible.length} {visible.length === 1 ? 'recipe' : 'recipes'}
          </button>
        </div>
      </Modal>
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
    return recipe.status === 'pending'
      ? 'Reading source…'
      : 'Extraction failed';
  }
  const time = recipe.totalMinutes
    ? `${recipe.timeEstimated ? '~' : ''}${recipe.totalMinutes} min`
    : null;
  return [time, ...recipe.tags].filter(Boolean).join(' · ');
}

function statusName(status: RecipeSummary['status']): string {
  return status === 'pending' ? 'New recipe' : 'Unread recipe';
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="type-label text-ink-muted mt-6 font-bold uppercase">
        {title}
      </h3>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </section>
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
    <button
      type="button"
      onClick={onClick}
      className={`type-label rounded-pill min-h-11 border px-3 py-2 ${active ? 'border-accent bg-accent text-accent-ink' : 'border-line text-ink-muted'}`}
    >
      {children}
    </button>
  );
}

function ActiveChip({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="type-label rounded-pill bg-accent text-accent-ink min-h-10 shrink-0 px-3 py-2"
    >
      {children}
    </button>
  );
}
