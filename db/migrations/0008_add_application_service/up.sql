-- Which service an order is for. The values mirror SERVICES in
-- src/core/domain/application/service.ts. Every order so far is a de-registration,
-- which the default records for rows already stored and for a release that does
-- not write the column yet.
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS service text NOT NULL DEFAULT 'deregistration';

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_service_known;
ALTER TABLE applications
  ADD CONSTRAINT applications_service_known
    CHECK (service IN ('newRegistration', 'reRegistration', 'changeOfKeeper', 'deregistration', 'addressChange'));
