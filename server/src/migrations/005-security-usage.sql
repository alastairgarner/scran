-- Charged attempts survive failures and restarts. UTC days, separate scopes
-- for each user and the whole installation; no recipe/user FK on purpose.
CREATE TABLE resourceUsage (
  day   TEXT NOT NULL,
  scope TEXT NOT NULL,
  kind  TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  PRIMARY KEY (day, scope, kind)
);
