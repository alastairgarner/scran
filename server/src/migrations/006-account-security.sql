-- Operator controls for invites and accounts. Better Auth's tables stay a
-- vendor island, so a disabled account is a row of ours keyed by `userId`, not
-- a column on its `user`. Disabling keeps the user, so recipe attribution stays.

ALTER TABLE invite ADD COLUMN revokedAt TEXT;

CREATE TABLE disabledAccount (
  userId     TEXT PRIMARY KEY,
  disabledAt TEXT NOT NULL
);
