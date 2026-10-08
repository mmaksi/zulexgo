-- Back to the seven statuses of 0001. Fails, and changes nothing, while any order or any status_history row
-- (both use the domain) still holds one of the two statuses removed: those have to be deleted first.
ALTER DOMAIN application_status DROP CONSTRAINT IF EXISTS application_status_check;
ALTER DOMAIN application_status
  ADD CONSTRAINT application_status_check CHECK (
    VALUE IN (
      'awaiting_payment',
      'submitted_and_paid',
      'submitted_to_kba',
      'completed',
      'failed_correctable',
      'failed_final',
      'cancelled'
    )
  );
