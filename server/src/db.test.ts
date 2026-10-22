import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { migrate } from './db';

/** @returns {string} A throwaway migrations directory holding `files`. */
const tempMigrations = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), 'scran-migrations-'));
  for (const [name, sql] of Object.entries(files)) {
    writeFileSync(join(dir, name), sql);
  }
  return dir;
};

/** @returns {string[]} Every table in the database, alphabetically. */
const tableNames = (db: Database) =>
  db
    .query('SELECT name FROM sqlite_master WHERE type = ? ORDER BY name')
    .all('table')
    .map(row => (row as { name: string }).name);

describe('migrate', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  it('applies the real migrations to an empty database', () => {
    // Arrange & act
    const applied = migrate(db);

    // Assert
    expect(applied).toEqual([
      '001-init.sql',
      '002-tags-and-time.sql',
      '003-source-rotation.sql',
      '004-extraction-failure-reason.sql',
    ]);
    expect(tableNames(db)).toEqual(
      expect.arrayContaining([
        'comment',
        'invite',
        'rating',
        'recipe',
        'recipeSearch',
        'recipeTag',
        'recipeVersion',
        'source',
      ]),
    );
  });

  it('is a no-op the second time, so boot is safe to repeat', () => {
    // Arrange
    migrate(db);

    // Act
    const applied = migrate(db);

    // Assert
    expect(applied).toEqual([]);
  });

  it('applies files in name order and skips non-SQL', () => {
    // Arrange
    const dir = tempMigrations({
      '002-second.sql': 'INSERT INTO ordering (step) VALUES (2);',
      '001-first.sql':
        'CREATE TABLE ordering (step INTEGER); ' +
        'INSERT INTO ordering (step) VALUES (1);',
      'README.md': 'not a migration',
    });

    // Act
    const applied = migrate(db, dir);

    // Assert
    expect(applied).toEqual(['001-first.sql', '002-second.sql']);
    expect(db.query('SELECT step FROM ordering ORDER BY step').all()).toEqual([
      { step: 1 },
      { step: 2 },
    ]);
  });

  it('applies only what is new when a migration is added later', () => {
    // Arrange
    const dir = tempMigrations({ '001-first.sql': 'CREATE TABLE a (x TEXT);' });
    migrate(db, dir);
    writeFileSync(join(dir, '002-second.sql'), 'CREATE TABLE b (x TEXT);');

    // Act
    const applied = migrate(db, dir);

    // Assert
    expect(applied).toEqual(['002-second.sql']);
  });

  it('rolls a failing migration back and does not record it', () => {
    // Arrange
    const dir = tempMigrations({
      '001-broken.sql': 'CREATE TABLE ok (x TEXT); NONSENSE;',
    });

    // Act
    const attempt = () => migrate(db, dir);

    // Assert
    expect(attempt).toThrow();
    expect(tableNames(db)).not.toContain('ok');
    expect(db.query('SELECT name FROM migration').all()).toEqual([]);
  });
});

const AT = '2026-01-01T00:00:00Z';

/** @returns {Database} A migrated database holding recipe 1, with no versions. */
const seedRecipe = () => {
  const db = new Database(':memory:');
  migrate(db);
  db.run(
    `INSERT INTO recipe (id, status, createdByUserId, createdAt, updatedAt)
     VALUES (1, 'ready', 'user_1', ?, ?)`,
    [AT, AT],
  );
  return db;
};

/** Appends a version of recipe 1, whose one ingredient line is `food`. */
const addVersion = (db: Database, name: string, food: string) => {
  const versionNo =
    (db.query('SELECT count(*) AS n FROM recipeVersion').get() as { n: number })
      .n + 1;
  db.run(
    `INSERT INTO recipeVersion (recipeId, versionNo, createdByUserId, name,
       ingredients, instructions, notes, createdAt, updatedAt)
     VALUES (1, ?, 'user_1', ?, ?, ?, '[]', ?, ?)`,
    [
      versionNo,
      name,
      JSON.stringify([{ text: `200g ${food}` }]),
      JSON.stringify([{ text: 'Roast everything.' }]),
      AT,
      AT,
    ],
  );
};

/** @returns {number} How many recipes the index returns for `term`. */
const matches = (db: Database, term: string) =>
  db
    .query('SELECT rowid FROM recipeSearch WHERE recipeSearch MATCH ?')
    .all(term).length;

describe('the search index trigger', () => {
  it('indexes the newest version and forgets the one it superseded', () => {
    // Arrange
    const db = seedRecipe();

    // Act
    addVersion(db, 'Lentil stew', 'lentils');
    addVersion(db, 'Buttered greens', 'butter');

    // Assert: one row per recipe, holding only the current version's text.
    expect(matches(db, 'butter')).toBe(1);
    expect(matches(db, 'lentils')).toBe(0);
    // Porter stemming, which is most of why FTS5 beats LIKE here.
    expect(matches(db, 'roasting')).toBe(1);
  });

  it('drops a soft-deleted recipe out of the index', () => {
    // Arrange
    const db = seedRecipe();
    addVersion(db, 'Lentil stew', 'lentils');

    // Act
    db.run("UPDATE recipe SET deletedAt = '2026-01-02T00:00:00Z' WHERE id = 1");

    // Assert
    expect(matches(db, 'lentil')).toBe(0);
  });
});
