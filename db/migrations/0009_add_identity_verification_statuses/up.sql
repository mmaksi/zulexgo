-- The two statuses a service that verifies the customer's identity passes through between payment and
-- filing (business logic steps 2 and 3). The values mirror APPLICATION_STATUSES in
-- src/core/domain/application/application-status.ts. The new list only adds to the old one, so every
-- stored row still passes.
ALTER DOMAIN application_status DROP CONSTRAINT IF EXISTS application_status_check;
ALTER DOMAIN application_status
  ADD CONSTRAINT application_status_check CHECK (
    VALUE IN (
      'awaiting_payment',
      'submitted_and_paid',
      'awaiting_identity_verification',
      'identity_verified',
      'submitted_to_kba',
      'completed',
      'failed_correctable',
      'failed_final',
      'cancelled'
    )
  );
