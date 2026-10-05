-- What the customer agreed to at checkout is kept with the order (launch plan D9): the AGB version and the moment
-- (`agb_version` and `consent_at`, present since 0001 and never written), and the version of the power of attorney a
-- service that files in the customer's name takes (launch plan Q46, a Neuzulassung).
ALTER TABLE applications ADD COLUMN IF NOT EXISTS power_of_attorney_version text;

-- The version and the time go together; a power of attorney implies the consent it was given with; and a Neuzulassung that
-- has any consent has the power of attorney too. An order made before consent was recorded has none of it, which stays valid.
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_consent_complete;
ALTER TABLE applications
  ADD CONSTRAINT applications_consent_complete CHECK (
    (agb_version IS NULL) = (consent_at IS NULL)
    AND (power_of_attorney_version IS NULL OR agb_version IS NOT NULL)
    AND (service <> 'newRegistration' OR consent_at IS NULL OR power_of_attorney_version IS NOT NULL)
  );
