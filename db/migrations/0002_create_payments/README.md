**Why:** every application is paid through exactly one provider payment, and refunds are computed from what was captured.
**Breaks without it:** an application cannot be linked back to its PaymentIntent for capture or refund.
**Live table:** safe; creates a new table only. `down.sql` drops payment links, so it runs in dev and CI only.
