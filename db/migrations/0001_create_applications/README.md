**Why:** applications must survive between the checkout request, the status page and the poller tick; on Vercel nothing else does.
**Breaks without it:** every stage on `REPOSITORY_DRIVER=postgres` has nowhere to store an order.
**Live table:** safe; creates new objects only. `down.sql` drops every application, so it runs in dev and CI only.
