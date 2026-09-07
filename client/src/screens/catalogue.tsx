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
        className="min-h-12 min-w-0 flex-1 rounded-pill border border-line bg-surface px-4 outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={() => update('filters', 'open')}
        className={`min-h-12 rounded-pill border-2 px-4 font-semibold ${active ? 'border-accent bg-accent text-accent-ink' : 'border-line text-ink-muted'}`}
      >
        Filter{active ? ` · ${active}` : ''}
      </button>
    </div>
  );

  return (
    <main className="mx-auto max-w-3xl pb-40 md:pb-8">
      <header className="px-4 pt-5 md:sticky md:top-0 md:z-10 md:border-line md:border-b md:bg-surface/95 md:pb-3 md:backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-bold font-display text-3xl tracking-display">
            scran
          </h1>
          <span className="ml-auto text-ink-muted text-sm">
            {visible.length} {visible.length === 1 ? 'recipe' : 'recipes'}
          </span>
          <Link
            to="/capture"
            className="hidden rounded-pill bg-accent px-4 py-2 font-semibold text-accent-ink md:block"
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
        <p className="p-10 text-center text-ink-muted">Loading recipes…</p>
      )}
      {recipes.error && (
        <p className="p-10 text-center text-veto">{recipes.error.message}</p>
      )}
      {!recipes.isPending && !recipes.error && (
        <ul>
          {visible.map(recipe => {
            const mark = aggregate(recipe, scope, session.data?.user.id ?? '');
            return (
              <li key={recipe.id}>
                <Link
                  to={`/recipes/${recipe.id}`}
                  className="flex min-h-20 items-center gap-4 border-line border-b px-4 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-semibold text-xl leading-snug tracking-display">
                      {recipe.name ?? statusName(recipe.status)}
                    </p>
                    <p className="mt-1 truncate text-ink-muted text-sm">
                      {summary(recipe)}
                    </p>
                  </div>
                  {mark && (
                    <span
                      className={`shrink-0 text-xl ${mark === 1 ? 'text-veto' : 'text-praise'}`}
                    >
                      {GLYPH[mark]}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="p-10 text-center text-ink-muted">
              Nothing matches.
            </li>
          )}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-line border-t bg-raised px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden">
        {controls}
      </div>
      <Link
        to="/capture"
        aria-label="Add a recipe"
        className="fixed right-4 bottom-24 z-30 grid h-16 w-16 place-items-center rounded-pill bg-accent text-3xl text-accent-ink shadow-card md:hidden"
      >
        +
      </Link>

      <Modal
        open={sheet}
        label="Filter and sort recipes"
        onClose={() => update('filters')}
      >
        <div className="p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex items-baseline justify-between">
            <h2 className="font-bold font-display text-xl tracking-display">
              Filter &amp; sort
            </h2>
            <button
              type="button"
              className="min-h-11 text-ink-muted text-sm underline"
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
            className="mt-6 min-h-12 w-full rounded-pill bg-accent px-4 font-semibold text-accent-ink"
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
      <h3 className="mt-5 font-bold text-ink-muted text-sm uppercase tracking-wide">
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
      className={`min-h-11 rounded-pill border px-3 py-2 text-sm ${active ? 'border-accent bg-accent text-accent-ink' : 'border-line text-ink-muted'}`}
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
      className="min-h-10 shrink-0 rounded-pill bg-accent px-3 py-2 text-accent-ink text-sm"
    >
      {children}
    </button>
  );
}
