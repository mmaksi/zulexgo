-- One row per de-registration order. The status values mirror
-- APPLICATION_STATUSES in src/core/domain/application-status.ts; a domain, not
-- an enum, so a later migration can change the list and still be reversed.
CREATE DOMAIN application_status AS text CHECK (
  VALUE IN (
    'awaiting_payment',
    'submitted_and_paid',
    'submitted_to_kba',
    'completed',
    'failed_correctable',
    'failed_final',
    'cancelled'
  )
);

CREATE TABLE IF NOT EXISTS applications (
  reference text PRIMARY KEY CHECK (reference ~ '^ZG-[0-9A-HJKMNP-TV-Z]{6}$'),
  version integer NOT NULL CHECK (version >= 1),
  status application_status NOT NULL,
  email text NOT NULL,
  plate_count smallint NOT NULL CHECK (plate_count IN (1, 2)),
  plate_prefix text NOT NULL,
  plate_letters text NOT NULL,
  plate_numbers text NOT NULL,
  vin text NOT NULL,
  -- AES-256-GCM, bound to the row; the key lives in the app, never here.
  encrypted_security_codes text NOT NULL,
  authority_ikfz_status text NOT NULL CHECK (authority_ikfz_status IN ('online', 'unavailable', 'offline')),
  idempotency_key text NOT NULL CONSTRAINT applications_idempotency_key_key UNIQUE,
  zulex_application_id text UNIQUE,
  retry_attempts integer NOT NULL DEFAULT 0 CHECK (retry_attempts >= 0),
  next_poll_at timestamptz,
  poll_attempts integer NOT NULL DEFAULT 0 CHECK (poll_attempts >= 0),
  -- Consent to the AGB version shown at checkout; written from M7.
  agb_version text,
  consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS applications_due_for_polling
  ON applications (next_poll_at)
  WHERE next_poll_at IS NOT NULL;

-- No policy: the app connects as the table owner, and nothing else may read it.
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
