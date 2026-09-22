-- Canvas data is independent from the executable definition. Old drafts receive an empty layout.
ALTER TABLE scenario_drafts
  ADD COLUMN editor jsonb NOT NULL DEFAULT '{"positions":{}}'::jsonb
  CHECK (jsonb_typeof(editor) = 'object');
