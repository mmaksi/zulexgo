# Codebase review — 2 October 2026

Reviewed the checkout and status UI, server actions and routes, application state
machine, payment/refund policy, polling and retry paths, repository concurrency,
token rotation, document authorization, environment guardrails, migrations and CI.
Changes are on `codex/deep-review`. No deployment or live vendor operation was performed.

An earlier draft also added per-order Postgres advisory locks around confirmation,
polling, cancellation, correction and link rotation. They were removed on review:
each vendor call pinned a database backend, the lock pool's wait had no timeout,
benign contention surfaced as poll failures, and a lock does not survive a crash,
so it could not close the gaps it was meant for. The race it addressed is gap 2.

## Fixed findings

| Priority | Finding and trigger | Change and regression evidence |
| --- | --- | --- |
| P1 | Payment confirmation accepted any held/captured payment, including a partial capture, partially refunded capture, or provider amount different from the order total. | Confirmation requires the order's full amount and logs the order reference when it refuses; correction uses that same stored total. Regressions verify no filing, email or status token for an insufficient payment. |
| P1 | Cancellation ignored the payment returned by capture. A concurrent full capture could leave the entire amount retained while the email promised a refund. | Settlement reconciles a larger actual capture and refunds down to the processing fee before completing cancellation. |
| P1 | A prior partial refund was ignored when calculating the next refund. Cancellation could refund too much; a full technical refund could fail forever with an excessive amount. | Refunds use the current retained balance minus the target retained amount. If an earlier refund already went beyond the fee, the policy reports the actual amounts and takes no more money. |
| P2 | Every Stripe invalid-request capture error became `HoldExpired`, including validation failures and a concurrent successful capture. | The adapter re-reads the payment: an actual capture is returned, an actual release is expired, and an unresolved provider error remains visible. Stripe's own "authorisation expired" codes still mean `HoldExpired`, even before the intent shows it. Regressions cover invalid-request and idempotency conflicts and both expiry codes. |
| P2 | Signed events for another application's malformed `order_id` threw a validation error, making irrelevant webhook deliveries fail repeatedly. | Invalid order references are ignored; signature verification remains required. |
| P2 | Completion/document/email/settlement and failure-handling errors left an order immediately due. Repeatedly failing orders could monopolize the earliest polling batch. | These failures, and a failure while giving up on a submission the service never confirmed, back off on the online table (a minute first, as after filing) whatever the authority's own pace, so a hand-processed order does not wait six hours for an email. Tests verify no immediate retry and eventual completion without duplicate customer mail. |
| P2 | Rejected eligibility, checkout and payment promises left the browser busy indefinitely. | Exceptions produce a retry message and reset busy state in `finally`; payment retries preserve an already-created order. Three UI regressions exercise request rejection and recovery. |

All new failing behavior regressions were run before their corresponding fixes.
Four existing mail-retry tests (email 5a, 5b, 5c and the refund email after our own
technical error) were changed on purpose: they asserted a retry on the very next
tick, which is the behavior the backoff replaces, and now assert the backoff first.

## Remaining gaps and limits

These are not fixed or certified by this review:

1. **Correction recovery needs a durable intent.** In
   `src/core/use-cases/correct-application.ts`, a PATCH can succeed and the final
   repository update can fail. The request changes are not saved before PATCH.
   A later correction sees `inProgress`, skips PATCH, and saves the later input,
   which may differ from what Zulex accepted. Nothing repairs this interruption
   window today. Persist the exact pending
   correction before contacting the vendor and reconcile that same intent on
   recovery; test an accepted PATCH followed by a failed save and a different
   retry input. Vendor completion/rejection during recovery also needs a confirmed
   reconciliation contract.
2. **Overlapping actions on one order are not excluded.** Cancel and correct claim
   the order with a version-checked write, but nothing a later request can see.
   A correction that starts after a cancellation's claim and before its money
   moves can file the application while the cancel refunds; the cancel then fails
   its last write on a stale version, leaving the order at status 4 with money
   partly returned. Two overlapping cron ticks can pick the same due order, and two
   concurrent payment confirmations can each issue a status token, so the emailed
   link may not be the stored one (the customer can recover with "Resend my link"). Version checks and idempotency keys limit the
   damage but do not remove it. The durable fix is the one gap 1 needs: persist the
   intent on the order (a `cancelling` marker, the pending correction) before any
   vendor call, so a later request refuses it, and store the first status token
   only if none exists. Rare at beta volume; decide before volume grows.
3. **The poller has no configured schedule.** `vercel.json` contains no cron.
   This is documented as intentional while the Zulex API is unavailable. Until a
   scheduler is activated and verified, asynchronous completion, silent retries
   and hold protection depend on someone invoking the authenticated endpoint.
   This review did not activate a production schedule. No order completes without it,
   so it blocks any real order.
4. **Launch dependencies remain open.** Identity verification still uses a fake,
   legal pages remain placeholders, and the existing consent columns are not
   populated by checkout/repository writes. The launch plan documents the missing
   product decisions. A green build is not evidence those launch requirements
   have been met.
5. **Real vendor behavior remains unverified.** Network doubles exercise the
   actual adapters but cannot establish Zulex replay/PATCH behavior or Stripe
   refund settlement in the deployed account. Failed/pending refunds and refund
   history beyond the adapter's first 100 records need reconciliation coverage.
   The existing request idempotency does not provide atomicity between a vendor
   action and a database checkpoint. The refund key is fixed per order while the
   amount is now computed from the payment, so a refund made by hand in Stripe
   between two attempts would make Stripe reject the second; refunds are meant to
   go through code only.
6. **Address-based throttling assumes trusted proxy headers.**
   `src/lib/client-address.ts` trusts forwarded headers, as its comment states.
   Verify that the deployed edge overwrites client-supplied headers; a different
   hosting/proxy arrangement needs an explicit trust policy. Public eligibility
   and checkout actions also have no application-level rate limiter; checkout
   creates a payment per call, so this needs to land before a public beta (card
   testing, chargebacks).

## Verification

- Final, on the code as it stands after the lock was removed: lint and typecheck
  clean; `npm test -- --ci` shows 877 passed and 72 skipped in 83 suites, seven
  snapshots passed. The 72 skipped are the Postgres suites. This change leaves the
  repository adapter, its port and the migrations as they were when the branch
  started, so they were not rerun here; CI runs them. The earlier figure of 950 passed with a
  local Postgres included the lock tests and no longer applies.
- Each fix was broken on purpose or seen failing before its change, and its test
  went red: the amount check, the correction total, the refund amount, the
  concurrent-capture re-settlement, the Stripe error handling and expiry codes, the
  refund-policy branch, the webhook reference, the poll backoff (completion, hand
  processed authority, unconfirmed submission) and the funnel error handling. The
  touched suites also pass shuffled. One full run during verification showed five
  failures in three suites that did not recur in eight further full runs; its
  output was not kept, so the cause is unknown.
- The production build with the CI configuration passes and the secret canary is
  absent from the client chunks; the order-showing routes are dynamic. The funnel's
  first step was driven in the dev server (one request on a double click, next step
  shown, no console errors).
- Browser behavior of a failed request is covered by the jsdom integration tests;
  real Stripe Elements, deployed Supavisor, real KBA responses and production
  scheduling were not exercised.
