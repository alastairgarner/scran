-- Application permissions stay outside Better Auth's vendor-owned tables.
-- Absence of a row means member, including all pre-existing accounts.
CREATE TABLE accountAccess (
  userId TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin'))
);
CREATE UNIQUE INDEX singleApplicationAdmin ON accountAccess(role) WHERE role = 'admin';

-- Also guard operator calls and concurrent processes, not just HTTP handlers.
CREATE TRIGGER protectAdminFromDisable
BEFORE INSERT ON disabledAccount
WHEN EXISTS (SELECT 1 FROM accountAccess WHERE userId = NEW.userId AND role = 'admin')
BEGIN
  SELECT RAISE(ABORT, 'The administrator cannot be disabled');
END;
CREATE TRIGGER protectDisabledFromPromotion
BEFORE INSERT ON accountAccess
WHEN NEW.role = 'admin' AND EXISTS (SELECT 1 FROM disabledAccount WHERE userId = NEW.userId)
BEGIN
  SELECT RAISE(ABORT, 'Disabled accounts cannot become administrator');
END;
CREATE TRIGGER protectDisabledFromRoleUpdate
BEFORE UPDATE ON accountAccess
WHEN NEW.role = 'admin' AND EXISTS (SELECT 1 FROM disabledAccount WHERE userId = NEW.userId)
BEGIN
  SELECT RAISE(ABORT, 'Disabled accounts cannot become administrator');
END;

CREATE TABLE managementAudit (
  id INTEGER PRIMARY KEY,
  actorUserId TEXT,
  action TEXT NOT NULL,
  targetId TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
