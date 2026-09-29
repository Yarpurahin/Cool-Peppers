-- Keep immutable published versions and attempt history after removing a scenario.
ALTER TABLE scenarios ADD COLUMN deleted_at timestamptz;
