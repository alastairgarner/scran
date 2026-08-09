-- Ticket 04's six tables and ticket 02's search index. Better Auth's four
-- tables are a vendor island: its CLI migrates them, never this file. The only
-- thing crossing that seam is `userId TEXT`.
--
-- Conventions: singular table names, camelCase columns, ISO-8601 strings for
-- timestamps — Better Auth's own style, so one file has one style. The
-- divergence is INTEGER PRIMARY KEY, because the search index is keyed
-- rowid = recipe.id and a TEXT id would mean maintaining a mapping.

CREATE TABLE recipe (
  id              INTEGER PRIMARY KEY,
  status          TEXT NOT NULL
                  CHECK (status IN ('pending', 'ready', 'failed')),
  createdByUserId TEXT NOT NULL,
  createdAt       TEXT NOT NULL,
  updatedAt       TEXT NOT NULL,
  -- NULL means alive; a timestamp means deleted, and when.
  deletedAt       TEXT
);

-- Append-only. The current version is simply the highest versionNo, so there
-- is no pointer on `recipe` that can disagree with the rows it points at.
-- `model IS NULL` means a person wrote this version rather than a model.
CREATE TABLE recipeVersion (
  id              INTEGER PRIMARY KEY,
  recipeId        INTEGER NOT NULL REFERENCES recipe (id),
  versionNo       INTEGER NOT NULL,
  createdByUserId TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  recipeYield     TEXT,
  yieldQuantity   REAL,
  yieldUnit       TEXT,
  totalTime       TEXT,
  prepTime        TEXT,
  performTime     TEXT,
  -- JSON arrays: {title, text, quantity, unit, food, note}[] for ingredients,
  -- {title, text}[] for the other two. Left as JSON because normalising them
  -- would copy every child row on every edit and buy nothing FTS doesn't.
  ingredients     TEXT NOT NULL,
  instructions    TEXT NOT NULL,
  notes           TEXT NOT NULL,
  model           TEXT,
  promptVersion   TEXT,
  tokensIn        INTEGER,
  tokensOut       INTEGER,
  createdAt       TEXT NOT NULL,
  updatedAt       TEXT NOT NULL,
  UNIQUE (recipeId, versionNo)
);

-- 0..N per recipe: a spread photographed as two pages is two rows, and a
-- typed-in recipe is no row at all.
CREATE TABLE source (
  id        INTEGER PRIMARY KEY,
  recipeId  INTEGER NOT NULL REFERENCES recipe (id),
  kind      TEXT NOT NULL CHECK (kind IN ('photo', 'html')),
  -- `path` is storage.ts's key, never a path anything else constructs.
  path      TEXT,
  url       TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

-- The household's scale: 1 cross, 2 tick, 3 double tick. Stored as integers so
-- "best rated" can sort; surfaced as a spread, never a mean.
CREATE TABLE rating (
  id        INTEGER PRIMARY KEY,
  recipeId  INTEGER NOT NULL REFERENCES recipe (id),
  userId    TEXT NOT NULL,
  score     INTEGER NOT NULL CHECK (score IN (1, 2, 3)),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE (recipeId, userId)
);

-- What a person wrote about the recipe. Not `notes`, which is the page's own.
CREATE TABLE comment (
  id        INTEGER PRIMARY KEY,
  recipeId  INTEGER NOT NULL REFERENCES recipe (id),
  userId    TEXT NOT NULL,
  body      TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  deletedAt TEXT
);

-- createdByUserId is nullable: the first invite has no creator, because
-- nobody exists yet to have made it.
CREATE TABLE invite (
  id               INTEGER PRIMARY KEY,
  tokenHash        TEXT NOT NULL UNIQUE,
  email            TEXT,
  expiresAt        TEXT NOT NULL,
  createdByUserId  TEXT,
  redeemedAt       TEXT,
  redeemedByUserId TEXT,
  createdAt        TEXT NOT NULL,
  updatedAt        TEXT NOT NULL
);

-- Own-content FTS5, not content='': contentless mode returns NULL from
-- snippet() and highlight(), which is the entire reason to want it.
CREATE VIRTUAL TABLE recipeSearch USING fts5 (
  name,
  ingredients,
  instructions,
  tokenize = 'porter unicode61'
);

-- One index row per recipe however many versions exist, rebuilt from whichever
-- version was appended last, so superseded text becomes unfindable and no
-- application code can forget to reindex.
CREATE TRIGGER recipeVersionIndex AFTER INSERT ON recipeVersion BEGIN
  DELETE FROM recipeSearch WHERE rowid = NEW.recipeId;
  INSERT INTO recipeSearch (rowid, name, ingredients, instructions)
  VALUES (
    NEW.recipeId,
    NEW.name,
    (
      SELECT group_concat(json_extract(value, '$.text'), ' ')
      FROM json_each(NEW.ingredients)
    ),
    (
      SELECT group_concat(json_extract(value, '$.text'), ' ')
      FROM json_each(NEW.instructions)
    )
  );
END;

-- Soft delete takes the recipe out of the index too. Undeleting is a SQL
-- statement plus re-appending the current version; there is no trash UI.
CREATE TRIGGER recipeDeleteIndex AFTER UPDATE OF deletedAt ON recipe
WHEN NEW.deletedAt IS NOT NULL BEGIN
  DELETE FROM recipeSearch WHERE rowid = NEW.id;
END;
