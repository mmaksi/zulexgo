-- A Neuzulassung order has no plate and no security codes: what its customer typed (owner, address,
-- bank account, eVB number, Teil II, plate choice) is one AES-256-GCM blob bound to the row, as the
-- security codes of a de-registration are, with only the VIN in the clear for the duplicate warning.
-- So the de-registration columns become nullable, and a check keeps each service to its own.
ALTER TABLE applications
  ALTER COLUMN plate_count DROP NOT NULL,
  ALTER COLUMN plate_prefix DROP NOT NULL,
  ALTER COLUMN plate_letters DROP NOT NULL,
  ALTER COLUMN plate_numbers DROP NOT NULL,
  ALTER COLUMN encrypted_security_codes DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS encrypted_details text,
  -- The identity verification a Neuzulassung waits on: the provider's id, and when the wait ends.
  ADD COLUMN IF NOT EXISTS identity_verification_id text,
  ADD COLUMN IF NOT EXISTS identity_verification_deadline timestamptz;

-- The values of `service` mirror SERVICES in src/core/domain/application/service.ts; one without a
-- request type has no stored shape, so a row of it is refused until a migration gives it one.
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_service_columns;
ALTER TABLE applications
  ADD CONSTRAINT applications_service_columns CHECK (
    CASE service
      WHEN 'deregistration' THEN
        plate_count IS NOT NULL AND plate_prefix IS NOT NULL AND plate_letters IS NOT NULL AND plate_numbers IS NOT NULL
        AND encrypted_security_codes IS NOT NULL AND encrypted_details IS NULL
      WHEN 'newRegistration' THEN
        encrypted_details IS NOT NULL
        AND plate_count IS NULL AND plate_prefix IS NULL AND plate_letters IS NULL AND plate_numbers IS NULL
        AND encrypted_security_codes IS NULL
      ELSE false
    END
  );

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_identity_verification_complete;
ALTER TABLE applications
  ADD CONSTRAINT applications_identity_verification_complete
    CHECK ((identity_verification_id IS NULL) = (identity_verification_deadline IS NULL));

-- A Neuzulassung has no plate to look an open order up by: the VIN alone, within its service (J8).
CREATE INDEX IF NOT EXISTS applications_by_service_vin ON applications (service, vin);
