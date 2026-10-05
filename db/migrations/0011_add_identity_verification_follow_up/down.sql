-- A failure of a kind the old check does not know cannot stay: it is forgotten, and the order keeps its status. A verification id stays
-- as the ciphertext it is; the code that predates 0011 carries it along as an opaque string.
UPDATE applications SET failure_kind = NULL WHERE failure_kind IN ('identityFailed', 'identityMismatch');

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_failure_kind_check;
ALTER TABLE applications
  ADD CONSTRAINT applications_failure_kind_check
    CHECK (failure_kind IN ('unavailable', 'rejected', 'kbaError', 'rejectionDocument'));

ALTER TABLE applications DROP COLUMN IF EXISTS identity_verification_reminder_sent;
