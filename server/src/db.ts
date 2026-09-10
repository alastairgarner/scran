import { Database } from 'bun:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { config } from './config';

const MIGRATIONS_DIR = join(import.meta.dir, 'migrations');

/**
 * Applies every numbered `.sql` file the database has not seen yet, each in its
 * own transaction so a broken one leaves no half-applied schema behind.
 *
 * @returns {string[]} The migrations applied by this call, in the order run.
 */
export function migrate(database: Database, dir = MIGRATIONS_DIR): string[] {
  database.run(`CREATE TABLE IF NOT EXISTS migration (
    name      TEXT PRIMARY KEY,
    appliedAt TEXT NOT NULL
  )`);

  const applied = new Set(
    database
      .query('SELECT name FROM migration')
      .all()
      .map(row => (row as { name: string }).name),
  );
  const pending = readdirSync(dir)
    .filter(name => name.endsWith('.sql') && !applied.has(name))
    .sort();

  for (const name of pending) {
    const sql = readFileSync(join(dir, name), 'utf8');
    database.transaction(() => {
      database.run(sql);
      database.run('INSERT INTO migration (name, appliedAt) VALUES (?, ?)', [
        name,
        new Date().toISOString(),
      ]);
    })();
  }

  return pending;
}

export const db = new Database(config.databaseUrl, { create: true });
// WAL so a read during an extraction write doesn't block; foreign keys are off
// by default in SQLite and the schema is full of them.
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');
