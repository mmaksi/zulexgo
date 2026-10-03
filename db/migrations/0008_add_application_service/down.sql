ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_service_known;
ALTER TABLE applications DROP COLUMN IF EXISTS service;
