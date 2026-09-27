**Why:** the status dashboard shows when each step was reached, and support needs the order of events.
**Breaks without it:** only the current status survives; the stepper loses its dates.
**Live table:** safe; creates a new table only. `down.sql` drops the history, so it runs in dev and CI only.
