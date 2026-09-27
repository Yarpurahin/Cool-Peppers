-- General contact requests are separate from reviews of completed attempts.
CREATE TABLE contact_messages (
  id uuid PRIMARY KEY,
  topic text NOT NULL CHECK (topic IN ('question', 'issue', 'idea', 'partnership')),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  message text NOT NULL CHECK (char_length(message) BETWEEN 20 AND 3000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contact_messages_created_idx ON contact_messages (created_at DESC, id DESC);
