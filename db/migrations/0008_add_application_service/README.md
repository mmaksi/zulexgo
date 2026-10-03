**Why:** the app now knows which service an order is for, so Neuzulassung can be added beside de-registration; the duplicate check and every status call are per service.
**Breaks without it:** the repository writes and reads a column that does not exist, and every checkout and status page fails.
**Live table:** safe; a column with a constant default is added without rewriting the table, and the check holds for every existing row. The default stays, so the previous release can still insert during a rollback. `down.sql` drops the column, which is lossless while every order is a de-registration.
