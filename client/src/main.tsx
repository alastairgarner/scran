import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './main.css';

type Summary = { id: number; name: string; created_at: string };
type Item = { title: string | null; text: string };
type Recipe = {
  name: string;
  description: string | null;
  recipe_yield: string | null;
  total_time: string | null;
  prep_time: string | null;
  perform_time: string | null;
  ingredients: Item[];
  instructions: Item[];
  notes: Item[];
};

type Line = { id: string; text: string };
type Section = { id: string; title: string | null; lines: Line[] };

const json = (url: string) => fetch(url).then(r => r.json());

/**
 * Items carry a title only on the first line of each section — regroup them for rendering.
 *
 * ponytail: ids are positional. The model gives us no stable id per line, and nothing here ever
 * reorders or filters; if editing ever mutates a section in place, ids move to the data model.
 */
const sections = (items: Item[] = []): Section[] => {
  const out: Section[] = [];
  for (const item of items) {
    const last = out.at(-1);
    if (item.title || !last) {
      const id = `s${out.length}`;
      out.push({
        id,
        title: item.title,
        lines: [{ id: `${id}l0`, text: item.text }],
      });
    } else {
      last.lines.push({
        id: `${last.id}l${last.lines.length}`,
        text: item.text,
      });
    }
  }
  return out;
};

function Detail({ id, onBack }: { id: number; onBack: () => void }) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);

  useEffect(() => {
    json(`/api/recipes/${id}`).then(r => setRecipe(r.data));
  }, [id]);

  if (!recipe) {
    return <p className="muted">Loading…</p>;
  }

  const meta = [
    recipe.recipe_yield,
    recipe.prep_time,
    recipe.perform_time,
    recipe.total_time,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <article>
      <button type="button" className="back" onClick={onBack}>
        ← All recipes
      </button>
      <h1>{recipe.name}</h1>
      {meta && <p className="meta">{meta}</p>}
      {recipe.description && <p className="muted">{recipe.description}</p>}

      <h2>Ingredients</h2>
      {sections(recipe.ingredients).map(s => (
        <div key={s.id}>
          {s.title && <h3>{s.title}</h3>}
          <ul>
            {s.lines.map(line => (
              <li key={line.id}>{line.text}</li>
            ))}
          </ul>
        </div>
      ))}

      <h2>Method</h2>
      {sections(recipe.instructions).map(s => (
        <div key={s.id}>
          {s.title && <h3>{s.title}</h3>}
          <ol>
            {s.lines.map(line => (
              <li key={line.id}>{line.text}</li>
            ))}
          </ol>
        </div>
      ))}

      {recipe.notes?.length > 0 && (
        <>
          <h2>Notes</h2>
          {recipe.notes.map(n => (
            <p key={n.text}>
              {n.title && <strong>{n.title}: </strong>}
              {n.text}
            </p>
          ))}
        </>
      )}
    </article>
  );
}

function List({ onOpen }: { onOpen: (id: number) => void }) {
  const [recipes, setRecipes] = useState<Summary[]>([]);
  const [status, setStatus] = useState('');

  const load = useCallback(() => json('/api/recipes').then(setRecipes), []);
  useEffect(() => {
    load();
  }, [load]);

  async function capture(file: File) {
    setStatus(`Extracting ${file.name}…`);
    const body = new FormData();
    body.append('photo', file);
    const res = await fetch('/api/extract', { method: 'POST', body }).then(r =>
      r.json(),
    );
    setStatus(res.error ? `Failed: ${res.error}` : '');
    await load();
  }

  return (
    <>
      <h1>scran</h1>
      {/* Native capture attribute: the phone camera, no library. */}
      <label className="capture">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={e => e.target.files?.[0] && capture(e.target.files[0])}
        />
        Photograph a recipe
      </label>
      {status && <p className="muted">{status}</p>}
      {recipes.length === 0 && !status && (
        <p className="muted">Nothing captured yet.</p>
      )}
      <ul className="recipes">
        {recipes.map(r => (
          <li key={r.id}>
            <button type="button" onClick={() => onOpen(r.id)}>
              {r.name}
              <span className="muted">
                {new Date(r.created_at).toLocaleDateString()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function App() {
  const [openId, setOpenId] = useState<number | null>(null);
  return (
    <main>
      {openId === null ? (
        <List onOpen={setOpenId} />
      ) : (
        <Detail id={openId} onBack={() => setOpenId(null)} />
      )}
    </main>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root is missing from index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
