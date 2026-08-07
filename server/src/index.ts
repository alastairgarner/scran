import { Database } from 'bun:sqlite';
import { Hono } from 'hono';
import { extractRecipe } from './extract';

const PHOTO_DIR = Bun.fileURLToPath(
  new URL('../../data/photos/', import.meta.url),
);

// One table, the model's JSON verbatim in `data` — ticket 03.
const db = new Database(
  Bun.fileURLToPath(new URL('../../data/scran.db', import.meta.url)),
  {
    create: true,
  },
);
db.run(`CREATE TABLE IF NOT EXISTS recipes (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  data       TEXT NOT NULL,
  photo_path TEXT NOT NULL,
  created_at TEXT NOT NULL
)`);

const app = new Hono();

app.get('/api/health', c => c.json({ ok: true, service: 'scran' }));

app.post('/api/extract', async c => {
  const photo = (await c.req.formData()).get('photo');
  if (!(photo instanceof File)) {
    return c.json({ error: "expected a file field named 'photo'" }, 400);
  }

  // Save first: the photo is the only thing here that can't be regenerated.
  const name = photo.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'photo.jpg';
  const photoPath = `${PHOTO_DIR}${Date.now()}-${name}`;
  await Bun.write(photoPath, photo);

  const result = {
    photoPath,
    extractedAt: new Date().toISOString(),
    ...(await extractRecipe(photo)),
  };
  const { lastInsertRowid } = db.run(
    'INSERT INTO recipes (name, data, photo_path, created_at) VALUES (?, ?, ?, ?)',
    [
      result.recipe.name ?? 'Untitled',
      JSON.stringify(result.recipe),
      photoPath,
      result.extractedAt,
    ],
  );
  const saved = { id: Number(lastInsertRowid), ...result };

  // Sidecar JSON kept as well as the row: it carries the model and token usage, which is what
  // makes comparing two models or two prompts possible. ponytail: cheaper than a runs table.
  await Bun.write(`${photoPath}.json`, JSON.stringify(saved, null, 2));
  return c.json(saved);
});

app.get('/api/recipes', c =>
  c.json(
    db.query('SELECT id, name, created_at FROM recipes ORDER BY id DESC').all(),
  ),
);

app.get('/api/recipes/:id', c => {
  const row = db
    .query('SELECT id, name, data, created_at FROM recipes WHERE id = ?')
    .get(c.req.param('id')) as { data: string } | null;
  return row
    ? c.json({ ...row, data: JSON.parse(row.data) })
    : c.json({ error: 'not found' }, 404);
});

// ponytail: errors surface raw on purpose — knowing how extraction breaks is the point of 05.
app.onError((err, c) => c.json({ error: String(err), stack: err.stack }, 500));

export default {
  port: 3000,
  fetch: app.fetch,
};

export { app };
