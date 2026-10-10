-- 0010's check requires a de-registration's codes in every status, and an order that has forgotten them cannot get
-- them back, so reverting deletes every such order (their payment, status history and status token go with them: those
-- cascade). The runner refuses to revert outside dev, where such orders are the seed's, and the seed loads them again.
DELETE FROM applications WHERE service = 'deregistration' AND encrypted_security_codes IS NULL;

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
