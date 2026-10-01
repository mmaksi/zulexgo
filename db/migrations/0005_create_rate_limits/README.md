**Why:** the status page and "resend my link" must be bounded per address and per link, and Vercel instances share no memory, so the counts live here.
**Breaks without it:** the limiter has nowhere to count; without a shared count, each instance would allow the full limit.
**Live table:** safe; creates a new table only. `down.sql` forgets every count, so it runs in dev and CI only.
