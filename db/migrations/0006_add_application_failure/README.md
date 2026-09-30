**Why:** the status page and emails 5b and 5c name the reason an application failed, so it has to outlive the request that decided it.
**Breaks without it:** the reason is lost after the poll tick, and the page can only say that something went wrong.
**Live table:** safe; two nullable columns and a check that existing rows satisfy. `down.sql` forgets every stored reason, so it runs in dev and CI only.
