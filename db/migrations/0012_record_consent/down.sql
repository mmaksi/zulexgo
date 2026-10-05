ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_consent_complete;

-- A Neuzulassung's consent is incomplete without its power of attorney, which the column dropped below holds, so it is
-- forgotten with it: left in place, reapplying the migration would refuse those rows. A de-registration's consent stays, as 0001 had it.
UPDATE applications SET agb_version = NULL, consent_at = NULL WHERE service <> 'deregistration';

ALTER TABLE applications DROP COLUMN IF EXISTS power_of_attorney_version;
