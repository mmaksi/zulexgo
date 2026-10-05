# Runbook — a service in beta (Neuzulassung's N9)

How to run a service while it is open to invited customers only: read how it is going, let people in, take them out, and open it to everyone. It holds facts about the code as built; thresholds are not set (the founder sets them after the first beta orders). Settings are in `.env.example` and `docs/provisioning.md` §10.

## Reading how it is going

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" "https://<stage host>/api/internal/report?days=30"
```

`days` is a whole number from 1 to 365 (30 if left out). The answer counts the orders created in that window, per service, and holds no reference, address or detail of any order. `401` means the secret is wrong or the stage has none; `400` a bad `days`; `503` the read failed (the log has the kind of error only).

| Field (per service) | What it says | What to look at |
|---|---|---|
| `byStatus` | Orders by where they stand now | A pile at `awaiting_identity_verification` or `submitted_to_kba` |
| `verification.waiting` | At the verification step, within the deadline | Normal while customers verify |
| `verification.stuck` | At the verification step **past the deadline**: the poller should have cancelled these (`checkIdentityVerification` expires them) | Anything above 0 means the poller is not running or is failing: `docs/provisioning.md` §5, then `GET /api/internal/poll` with the same bearer token by hand and read its `failed` count |
| `verification.verified`, `mismatched`, `failed`, `expired`, `unresolved` | How the **first** verification of each order ended. A mismatch that was corrected and then verified still counts as the mismatch it first was | `mismatched`: the name on the order is not the one verified (Q47); `failed`: the provider refused; `expired`: the customer never verified |
| `verification.failureRate`, `abandonmentRate` | `(mismatched + failed)` and `expired`, each over the verifications that ended; absent while none has | Abandonment is the drop-off after payment: the reminder email is the one lever (registration plan, Risks) |
| `completed`, `failedFinal`, `failedFinalShare` | Of the orders decided, how many ended as a 5c: refused for good by the KBA, refused by Zulex before filing, or a failed identity verification (which `verification.failed` counts too). 109.01 € back | Typos in data that cannot be corrected after filing (registration plan, API finding 6) |

The window is by when an order was **created**: one created before it does not count even if it ends inside it, and an order stuck for longer than `days` drops out of `stuck` and `byStatus`. A stuck order is recent when it first appears (the deadline is days, the default window 30), so reading the report regularly catches it; `days=365` is the longest look back.

## Letting people in

An invite code is one person's. In the stage's Vercel project, set the three variables for the service (`.env.example` explains each):

```bash
openssl rand -hex 5 | tr a-f A-F   # one code, 10 characters
```

- `BETA_SERVICES=newRegistration`
- `INVITE_CODES_NEW_REGISTRATION=<code>,<code>` (at least 8 characters each)
- `BETA_DAILY_CAP=<checkouts a day>` (default 5)

Redeploy. The deploy refuses to boot, naming the variable, if a service is in beta with no codes, if codes are set for a service that is not in `BETA_SERVICES`, or if a code is shorter than 8 characters.

The cap counts checkouts that reached the payment step, in a 24-hour window that starts at the first of them. A place is spent when the payment is attempted, paid or not and even if the attempt fails, and the limiter cannot give one back: a payment provider outage during checkout uses places up too, and then customers are told today's places are gone. Raise `BETA_DAILY_CAP` and redeploy if that happens. A customer who meets the cap is told to try tomorrow.

## Taking someone out

Delete their code from the variable and redeploy. A browser that already redeemed it sees the invite form again on its next visit, and a checkout it has open fails with "Ihre Einladung gilt nicht mehr"; the order is not created. Nothing already paid is touched.

## Opening to everyone

Remove the service from `BETA_SERVICES` and delete its codes (the deploy refuses codes without the service in beta), then redeploy. The gate and the landing badge disappear; the daily cap no longer applies.

## Stopping sales

Take the service out of `SERVICES_ON_SALE` and redeploy; that one change is enough, and `BETA_SERVICES` and the codes can stay for when it returns. Its funnel is then not found, its landing card says "Bald verfügbar" and checkout refuses it. Orders already paid carry on: the poller, the identity callback, the status pages and the confirmation page a customer returning from Stripe lands on do not depend on the setting.

## What a live run still has to show

The exit criteria of N9 (`docs/registration-plan.md`) are observations of real orders, not settings: every status matching Zulex's, documents downloaded from production, the assigned plate shown or pointed to, one 5b corrected and resubmitted, and no personal data in logs, emails or status pages. None has been observed.
