-- Originals stay untouched. Retries apply the saved rotation after EXIF orientation.
ALTER TABLE source ADD COLUMN rotation INTEGER NOT NULL DEFAULT 0
  CHECK (rotation IN (0, 90, 180, 270));
