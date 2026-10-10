-- An order that has ended forgets its security codes (launch plan Q22, provisional): they prove possession for one
-- filing, and an order that has ended is never filed again. So a de-registration's codes may be empty once its status
-- is final; until then the check still requires them. The rest is 0010's check as it was.
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_service_columns;
ALTER TABLE applications
  ADD CONSTRAINT applications_service_columns CHECK (
    CASE service
      WHEN 'deregistration' THEN
        plate_count IS NOT NULL AND plate_prefix IS NOT NULL AND plate_letters IS NOT NULL AND plate_numbers IS NOT NULL
        AND (encrypted_security_codes IS NOT NULL OR status IN ('completed', 'failed_final', 'cancelled'))
        AND encrypted_details IS NULL
      WHEN 'newRegistration' THEN
        encrypted_details IS NOT NULL
        AND plate_count IS NULL AND plate_prefix IS NULL AND plate_letters IS NULL AND plate_numbers IS NULL
        AND encrypted_security_codes IS NULL
      ELSE false
    END
  );
