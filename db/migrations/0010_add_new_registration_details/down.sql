-- A Neuzulassung order cannot be held without its details and with its plate columns required, so reverting
-- deletes every one (their payment, status history and status token go with them: those cascade). The runner
-- refuses to revert outside dev, where such orders are the seed's.
DELETE FROM applications WHERE service <> 'deregistration';

ALTER TABLE applications
  ALTER COLUMN plate_count SET NOT NULL,
  ALTER COLUMN plate_prefix SET NOT NULL,
  ALTER COLUMN plate_letters SET NOT NULL,
  ALTER COLUMN plate_numbers SET NOT NULL,
  ALTER COLUMN encrypted_security_codes SET NOT NULL;

DROP INDEX IF EXISTS applications_by_service_vin;
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_identity_verification_complete;
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_service_columns;
ALTER TABLE applications
  DROP COLUMN IF EXISTS identity_verification_deadline,
  DROP COLUMN IF EXISTS identity_verification_id,
  DROP COLUMN IF EXISTS encrypted_details;
