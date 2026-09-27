-- The one-time link's token: found by hash, readable only with the app's key.
-- One row per application, so setting a new token revokes the old one.
CREATE TABLE IF NOT EXISTS status_tokens (
  application_reference text PRIMARY KEY REFERENCES applications (reference) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  encrypted_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE status_tokens ENABLE ROW LEVEL SECURITY;
