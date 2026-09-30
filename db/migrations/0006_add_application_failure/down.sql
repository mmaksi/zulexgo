ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_failure_code_only_for_kba_errors;
ALTER TABLE applications DROP COLUMN IF EXISTS failure_code;
ALTER TABLE applications DROP COLUMN IF EXISTS failure_kind;
