-- Ticket 19: tags, the two time columns, and the search index rebuilt around
-- both. A `002` rather than folded into `001` because `001` has run somewhere
-- that matters — the dev database still holds the prototype's nine `recipes`
-- rows until ticket 17 migrates them, so recreating it is not free.

-- Additive and nullable, exactly like ticket 10's yieldQuantity. NULL where
-- even a judgement was impossible; timeEstimated is 0 when the page said so
-- and 1 when the model worked it out by reading the method.
ALTER TABLE recipeVersion ADD COLUMN totalMinutes  INTEGER;
ALTER TABLE recipeVersion ADD COLUMN timeEstimated INTEGER;

-- The eighth table. Keyed to `recipe`, not `recipeVersion`: a tag labels the
-- dish rather than reproducing the page, so correcting one appends no version.
CREATE TABLE recipeTag (
  recipeId INTEGER NOT NULL REFERENCES recipe (id),
  tag      TEXT NOT NULL,
  PRIMARY KEY (recipeId, tag)
);

-- ponytail: a projection of `shared`'s TAGS constant, not a vocabulary anyone
-- edits — the constant stays the source of truth and `syncTagSearch` rewrites
-- these ten rows at every boot. It exists because the index has to be
-- maintained by a trigger, and a trigger cannot read a TypeScript array.
CREATE TABLE tagSearch (
  tag    TEXT PRIMARY KEY,
  search TEXT NOT NULL
);

-- FTS5 cannot ALTER TABLE ADD COLUMN, so gaining `tags` means dropping and
-- recreating the virtual table. Nothing is lost: appending a version rebuilds
-- a recipe's row, and nothing has been indexed yet anyway.
DROP TRIGGER recipeVersionIndex;
DROP TRIGGER recipeDeleteIndex;
DROP TABLE recipeSearch;

CREATE VIRTUAL TABLE recipeSearch USING fts5 (
  name,
  ingredients,
  instructions,
  -- The tag's `search` string, never its id, so *veggie* finds `vegetarian`.
  -- Porter stemming gets nowhere near that on its own.
  tags,
  tokenize = 'porter unicode61'
);

-- One index row per recipe however many versions exist. The tags have to be
-- re-selected here as well as maintained below, or every edit would silently
-- wipe them out of the index.
CREATE TRIGGER recipeVersionIndex AFTER INSERT ON recipeVersion BEGIN
  DELETE FROM recipeSearch WHERE rowid = NEW.recipeId;
  INSERT INTO recipeSearch (rowid, name, ingredients, instructions, tags)
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
    ),
    (
      SELECT group_concat(s.search, ' ')
      FROM recipeTag t JOIN tagSearch s ON s.tag = t.tag
      WHERE t.recipeId = NEW.recipeId
    )
  );
END;

-- The second trigger ticket 19 costed: tags change without a version, so the
-- index has to follow them on their own. Both fire per row.
CREATE TRIGGER recipeTagIndex AFTER INSERT ON recipeTag BEGIN
  UPDATE recipeSearch
  SET tags = (
    SELECT group_concat(s.search, ' ')
    FROM recipeTag t JOIN tagSearch s ON s.tag = t.tag
    WHERE t.recipeId = NEW.recipeId
  )
  WHERE rowid = NEW.recipeId;
END;

CREATE TRIGGER recipeTagUnindex AFTER DELETE ON recipeTag BEGIN
  UPDATE recipeSearch
  SET tags = (
    SELECT group_concat(s.search, ' ')
    FROM recipeTag t JOIN tagSearch s ON s.tag = t.tag
    WHERE t.recipeId = OLD.recipeId
  )
  WHERE rowid = OLD.recipeId;
END;

-- Unchanged from 001, recreated because its table was.
CREATE TRIGGER recipeDeleteIndex AFTER UPDATE OF deletedAt ON recipe
WHEN NEW.deletedAt IS NOT NULL BEGIN
  DELETE FROM recipeSearch WHERE rowid = NEW.id;
END;
