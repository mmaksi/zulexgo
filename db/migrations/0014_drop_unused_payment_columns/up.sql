ALTER TABLE payments
  DROP COLUMN IF EXISTS stripe_customer_id,
  DROP COLUMN IF EXISTS captured_cents,
  DROP COLUMN IF EXISTS refunded_cents,
  DROP COLUMN IF EXISTS retained_fee_cents;
