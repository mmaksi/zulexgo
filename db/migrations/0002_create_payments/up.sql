-- The only payment data ZulexGO keeps: provider IDs and amounts. Card and bank
-- details stay with Stripe.
CREATE TABLE IF NOT EXISTS payments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Unique while an order has one payment; a correction surcharge (Q11) would lift it.
  application_reference text NOT NULL UNIQUE REFERENCES applications (reference) ON DELETE CASCADE,
  stripe_payment_intent_id text NOT NULL UNIQUE,
  -- Per order or per email address is open (Q15); written from M4.
  stripe_customer_id text,
  total_cents integer NOT NULL CHECK (total_cents > 0),
  -- Written from M6, once capture and refund execution (Q7, Q8) are decided.
  captured_cents integer NOT NULL DEFAULT 0 CHECK (captured_cents >= 0),
  refunded_cents integer NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0),
  retained_fee_cents integer NOT NULL DEFAULT 0 CHECK (retained_fee_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (refunded_cents <= captured_cents)
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
