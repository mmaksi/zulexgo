ALTER TABLE payments
  ADD COLUMN stripe_customer_id text,
  ADD COLUMN captured_cents integer NOT NULL DEFAULT 0 CHECK (captured_cents >= 0),
  ADD COLUMN refunded_cents integer NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0),
  ADD COLUMN retained_fee_cents integer NOT NULL DEFAULT 0 CHECK (retained_fee_cents >= 0),
  ADD CONSTRAINT payments_check CHECK (refunded_cents <= captured_cents);
