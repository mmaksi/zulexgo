-- Why an application is at 5b or 5c. The kind mirrors FAILURE_KINDS in
-- src/core/domain/failure.ts; the code is the KBA's, present only for its errors.
-- Vendor descriptions and details are never stored: the customer's wording
-- comes from our own catalogue (src/core/domain/rejection-catalogue.ts).
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS failure_kind text
    CHECK (failure_kind IN ('unavailable', 'rejected', 'kbaError', 'rejectionDocument')),
  ADD COLUMN IF NOT EXISTS failure_code integer;

ALTER TABLE applications
  DROP CONSTRAINT IF EXISTS applications_failure_code_only_for_kba_errors;
ALTER TABLE applications
  ADD CONSTRAINT applications_failure_code_only_for_kba_errors
    CHECK ((failure_kind = 'kbaError') = (failure_code IS NOT NULL));
