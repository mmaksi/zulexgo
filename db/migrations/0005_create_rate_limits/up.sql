-- Attempts per keyed hash and window, shared by every instance. The key is an
-- HMAC, so an address or an email never sits in this table.
CREATE TABLE IF NOT EXISTS rate_limits (
  key_hash text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0)
);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
