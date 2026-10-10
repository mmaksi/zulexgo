**Why:** nothing ever wrote `stripe_customer_id`, `captured_cents`, `refunded_cents` or `retained_fee_cents`. No Stripe Customer is created (launch plan Q15), and the amounts are read from Stripe (Q36), so the columns stayed empty and only suggested a second record that does not exist.
**Breaks without it:** nothing; it removes columns no code reads or writes.
**Live table:** safe. Dropping a column only changes the catalogue: no rewrite, a brief lock, and the release before this one never names these columns. The `down.sql` adds them back empty, which is all they ever held.
