-- Separate migration: never rewrite checksums of previously applied migrations.
ALTER TABLE app_users ADD COLUMN is_super_admin boolean NOT NULL DEFAULT false;
ALTER TABLE app_users ADD CONSTRAINT app_users_super_admin_role CHECK (NOT is_super_admin OR role = 'admin');
CREATE UNIQUE INDEX app_users_single_super_admin ON app_users (is_super_admin) WHERE is_super_admin;
ALTER TABLE app_users ADD COLUMN avatar_data text CHECK (octet_length(avatar_data) <= 700000);

-- Retire only the two bundled demos. Keep immutable versions and practice history.
UPDATE scenarios SET deleted_at = now(), archived_at = coalesce(archived_at, now()), updated_at = now()
WHERE id IN ('new-deadline', 'feedback') AND owner_id IS NULL AND deleted_at IS NULL;
