-- What the identity verification step (Neuzulassung plan N5) adds to an order:
-- two kinds of failure (the values mirror FAILURE_KINDS in src/core/domain/registration/failure.ts), whether the
-- reminder to verify was sent, and the provider's verification id now held as ciphertext.
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_failure_kind_check;
ALTER TABLE applications
  ADD CONSTRAINT applications_failure_kind_check
    CHECK (failure_kind IN ('unavailable', 'rejected', 'kbaError', 'rejectionDocument', 'identityFailed', 'identityMismatch'));

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS identity_verification_reminder_sent boolean NOT NULL DEFAULT false;

-- Until now the id was stored as the provider issued it. It is AES-GCM ciphertext bound to the order from here on, and
-- a plaintext one cannot be read as such. No code path could start a verification before this step, so the only rows
-- that hold one are the seed's on dev and staging; they lose their verification. The seed leaves an order that exists as it is,
-- so those orders get it back only when they are deleted and the seed is loaded again.
UPDATE applications SET identity_verification_id = NULL, identity_verification_deadline = NULL
  WHERE identity_verification_id IS NOT NULL;
