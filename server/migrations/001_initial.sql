CREATE TABLE app_users (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  email text NOT NULL CHECK (char_length(email) <= 254 AND email = lower(btrim(email))),
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_users_email_key UNIQUE (email)
);

CREATE TABLE auth_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires_at);

CREATE TABLE scenarios (
  id text PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9_-]{1,100}$'),
  owner_id uuid REFERENCES app_users(id) ON DELETE RESTRICT,
  published_version integer,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scenarios_owner_idx ON scenarios(owner_id);

-- A graph is one atomic, validated document. Versions are immutable snapshots.
CREATE TABLE scenario_versions (
  scenario_id text NOT NULL REFERENCES scenarios(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  preview jsonb NOT NULL CHECK (jsonb_typeof(preview) = 'object'),
  definition jsonb CHECK (jsonb_typeof(definition) = 'object'),
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scenario_id, version),
  CHECK ((preview->>'id') IS NOT NULL AND preview->>'id' = scenario_id),
  CHECK (definition IS NULL OR (
    (definition #>> '{metadata,id}') IS NOT NULL AND
    (definition #>> '{metadata,version}') IS NOT NULL AND
    definition #>> '{metadata,id}' = scenario_id AND
    (definition #>> '{metadata,version}')::integer = version
  ))
);
ALTER TABLE scenarios ADD CONSTRAINT scenarios_published_version_fk
  FOREIGN KEY (id, published_version) REFERENCES scenario_versions(scenario_id, version)
  DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION protect_scenario_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Published scenario versions are immutable; publish a new version';
END;
$$;
CREATE TRIGGER scenario_versions_immutable BEFORE UPDATE OR DELETE ON scenario_versions
  FOR EACH ROW EXECUTE FUNCTION protect_scenario_version();

CREATE TABLE scenario_drafts (
  scenario_id text PRIMARY KEY REFERENCES scenarios(id) ON DELETE CASCADE,
  preview jsonb NOT NULL CHECK (jsonb_typeof(preview) = 'object'),
  definition jsonb CHECK (jsonb_typeof(definition) = 'object'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((preview->>'id') IS NOT NULL AND preview->>'id' = scenario_id)
);

CREATE TABLE attempts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  scenario_id text NOT NULL,
  scenario_version integer NOT NULL,
  status text NOT NULL CHECK (status IN ('in-progress', 'completed')),
  current_node_id text,
  ending_id text,
  penalties integer NOT NULL DEFAULT 0 CHECK (penalties >= 0),
  started_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz,
  abandoned_at timestamptz,
  is_current boolean NOT NULL DEFAULT true,
  FOREIGN KEY (scenario_id, scenario_version) REFERENCES scenario_versions(scenario_id, version),
  CHECK (updated_at >= started_at),
  CHECK (
    (status = 'in-progress' AND current_node_id IS NOT NULL AND ending_id IS NULL AND completed_at IS NULL) OR
    (status = 'completed' AND current_node_id IS NULL AND ending_id IS NOT NULL AND completed_at = updated_at)
  ),
  CHECK (abandoned_at IS NULL OR (status = 'in-progress' AND NOT is_current AND abandoned_at >= started_at))
);
CREATE UNIQUE INDEX attempts_current_idx ON attempts(user_id, scenario_id) WHERE is_current;
CREATE INDEX attempts_history_idx ON attempts(user_id, started_at DESC, id);
CREATE INDEX attempts_version_idx ON attempts(scenario_id, scenario_version);

CREATE TABLE attempt_answers (
  attempt_id uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence >= 0),
  node_id text NOT NULL,
  answer_id text NOT NULL,
  answered_at timestamptz NOT NULL,
  PRIMARY KEY (attempt_id, sequence),
  UNIQUE (attempt_id, node_id)
);

CREATE TABLE feedback (
  attempt_id uuid PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
  helpful boolean NOT NULL,
  comment text NOT NULL DEFAULT '' CHECK (char_length(comment) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
