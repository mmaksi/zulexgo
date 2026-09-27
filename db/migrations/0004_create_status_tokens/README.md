**Why:** customers have no account; the token in the emailed link is their only way back to the order.
**Breaks without it:** status links cannot be resolved, and later emails cannot repeat the same link.
**Live table:** safe; creates a new table only. `down.sql` invalidates every status link, so it runs in dev and CI only.
