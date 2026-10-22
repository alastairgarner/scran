/** Synthetic preview data, safe to rerun; never connects to household data. */
import { createInvite, migrateAuth, redeemInvite } from '../auth';
import { config } from '../config';
import { db, migrate } from '../db';
import {
  addComment,
  addVersion,
  rate,
  setTags,
  syncTagSearch,
} from '../recipes';

if (
  config.databaseUrl !== '/data/scran.db' ||
  config.cookieSecure ||
  !config.baseUrl.startsWith('http://127.0.0.1:')
) {
  throw new Error('Seed only runs in a localhost preview container.');
}

migrate(db);
await migrateAuth();
syncTagSearch();
const email = 'preview@scran.test';
let user = db
  .query<{ id: string }, [string]>('SELECT id FROM user WHERE email = ?')
  .get(email);
if (!user) {
  const token = new URL(createInvite(email)).pathname.split('/').pop();
  if (!token) {
    throw new Error('Missing preview invite token.');
  }
  await redeemInvite(token, {
    name: 'Preview Cook',
    email,
    password: 'scran-preview-password',
  });
  user = db
    .query<{ id: string }, [string]>('SELECT id FROM user WHERE email = ?')
    .get(email);
}
if (!user) {
  throw new Error('Preview account was not created.');
}
const userId = user.id;

// A marker means edits/deletions made during UI validation survive rebuilds.
db.run('CREATE TABLE IF NOT EXISTS previewSeed (version INTEGER PRIMARY KEY)');
if (!db.query('SELECT version FROM previewSeed WHERE version = 1').get()) {
  db.transaction(() => {
    const at = new Date().toISOString();
    for (const [name, minutes, tag] of [
      ['Lemon chickpea stew', 25, 'vegetarian'],
      ['Roast chicken with potatoes', 75, 'meat'],
      ['Apple crumble', 50, 'pudding'],
    ] as const) {
      const result = db.run(
        `INSERT INTO recipe (status, createdByUserId, createdAt, updatedAt)
         VALUES ('ready', ?, ?, ?)`,
        [userId, at, at],
      );
      const recipeId = Number(result.lastInsertRowid);
      addVersion(recipeId, {
        userId,
        content: {
          name,
          description: 'Synthetic recipe for worktree UI validation.',
          recipeYield: '4 servings',
          yieldQuantity: 4,
          yieldUnit: 'servings',
          totalTime: `PT${minutes}M`,
          prepTime: null,
          performTime: null,
          totalMinutes: minutes,
          timeEstimated: false,
          ingredients: [
            {
              title: null,
              text: '2 onions, chopped',
              quantity: 2,
              unit: null,
              food: 'onions',
              note: 'chopped',
            },
            {
              title: null,
              text: 'Salt to taste',
              quantity: null,
              unit: null,
              food: 'salt',
              note: null,
            },
          ],
          instructions: [
            {
              title: null,
              text: 'Prepare the ingredients and cook until ready.',
            },
          ],
          notes: [
            {
              title: null,
              text: 'Preview fixture; not a tested cooking recipe.',
            },
          ],
        },
      });
      setTags(recipeId, [tag]);
      rate(recipeId, userId, 3);
      addComment(recipeId, userId, 'A sample household comment.');
    }
    for (const status of ['pending', 'failed']) {
      db.run(
        'INSERT INTO recipe (status, createdByUserId, createdAt, updatedAt) VALUES (?, ?, ?, ?)',
        [status, userId, at, at],
      );
    }
    db.run('INSERT INTO previewSeed (version) VALUES (1)');
  })();
}
process.stdout.write('Preview seed ready.\n');
db.close();
