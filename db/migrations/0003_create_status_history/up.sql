-- Append-only: when each status was reached, for the status page and support.
CREATE TABLE IF NOT EXISTS status_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_reference text NOT NULL REFERENCES applications (reference) ON DELETE CASCADE,
  status application_status NOT NULL,
  changed_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS status_history_by_application
  ON status_history (application_reference, id);

ALTER TABLE status_history ENABLE ROW LEVEL SECURITY;
