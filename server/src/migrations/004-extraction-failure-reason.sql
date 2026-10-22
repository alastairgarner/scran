ALTER TABLE recipe ADD COLUMN failureReason TEXT
  CHECK (failureReason IS NULL OR (status = 'failed' AND failureReason = 'no_recipe'));
