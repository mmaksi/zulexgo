# De-registration (Außerbetriebsetzung) — User Journeys & API Findings

Scope: B2C MVP on `POST /deregistration-applications`, `GET /deregistration-applications/{id}`, `PATCH /deregistration-applications/{id}`, `POST /applications/{id}/retry`, `GET /documents/{id}`.

Business logic: [launch-plan.md](launch-plan.md) is source of truth; open points are its Q1–Q18. Statuses: 1 submitted & paid → 2 waiting for identity verification → 3 identity verified → 4 submitted to KBA → 5a completed | 5b failed, correctable | 5c failed, not correctable. Email numbers are the launch plan's.

## Data the customer must provide

| Field | Constraint | Notes |
|---|---|---|
| Licence plate (prefix, letters, numbers) | `[A-ZÄÖÜ]{1,3}` / `[A-Z]{1,2}` / 1–4 digits, no leading 0 | Required |
| Rear plate security code | 3 alphanumeric | Required (scratched off rear plate seal) |
| Front plate security code | 3 alphanumeric | Two-plate vehicles (cars) only. API can't enforce — UI must ask "one plate or two?" |
| Security code, registration certificate part 1 | 7 alphanumeric | Required (scratched field on Zulassungsbescheinigung Teil I) |
| VIN | 1–17 chars `[A-Z0-9]` | Required. Loose API pattern; UI expects 17 chars for modern vehicles, allows shorter for old ones |
| `reserveLicencePlate` | boolean | Out of scope — always omit/send `false` (founder decision) |
| Email, payment | — | **Not part of the API.** Ours to collect for Stripe, status emails, one-time link |

Always send `X-Idempotency-Key` (one per checkout attempt): a network retry must never create two applications and two charges.

---

## Journeys

### J1 — Happy path (two-plate car)
Select "De-register vehicle" → eligibility check (German plate, has Teil I, plate seals intact, authority reachable) → enter plate, VIN, scratch and enter 3 codes (front, rear, certificate) → see price and 19.99 € processing-fee notice, pay in Stripe Payment Element (card held by pre-authorization; SEPA captured at checkout) → signed Stripe webhook starts application: **status 1**, email 1 (order ID, status link) → **status 2**, email 2 (Verimi link); selfie + ID scan → **status 3**, email 3 → backend submits to API (`201`, `applicationId`) → **status 4**, email 4, polling starts. `FINISHED` with `DEREGISTRATION_CONFIRMATION` document → **5a**, email 5a; customer downloads official confirmation PDF from status page. Success screen states insurance and vehicle tax stop automatically via KBA. Open: when held card payment is captured (Q7); which Stripe event starts the application (Q6); Zulex called at status 1 or 3 (Q5).

### J2 — Happy path (motorcycle / trailer, one plate)
As J1, but UI asked "how many plates?" first and never showed front-code field. Omitting `frontLicencePlateSecurityCode` is valid for the API.

### J3 — Input rejected at submission (400)
Backend receives `400`. **Gap: spec defines no response body for 4xx errors**, so field-level mapping not guaranteed. Mitigation: validate everything client-side before payment (patterns above, scratch-code length, checksum-ish VIN checks) so 400 is rare. If it happens, error algorithm classifies it correctable (5b) or not (5c). Whether a data error gets the one automatic retry: open (Q18). Until the error catalogue exists, unrecognised error → 5b (launch-plan fallback).

### J4 — Failed, correction possible (5b)
Polling shows failure with `errorInfo` (code, description, details) and/or `REJECTION` document. After error algorithm runs: email 5b (reason, correction link, cancel option + fee notice); status page shows "Correction required" with human-readable reason. Options:
- **Correct and resubmit:** re-enter wrong field(s); backend sends `PATCH` with only corrected fields, resubmitting to KBA → status 4. Only a price difference is charged, as separate payment, only if one arises (Q11).
- **Cancel:** 19.99 € retained, rest refunded → status "cancelled", email 6 once Stripe confirms refund. Later resubmission is a new order at full price.

**Gap: API doesn't say whether a rejection is correctable.** UI must infer from `errorInfo.code` — needs error-code catalogue from API provider (founder clarifying). Which de-registration failures are correctable: Q10.

### J5 — Failed, correction not possible (5c)
E.g. vehicle already deregistered, plate/VIN mismatch confirmed by KBA, alerts against vehicle, identity verification failed. Status page: terminal "Failed" with reason and "Start a new application" CTA. Refund amount minus 19.99 € (email 5c, then email 6); new application is a new order at full price. How "minus 19.99 €" is executed on a held payment — partial capture or capture then refund — open (Q8).

### J6 — Technical error (ERROR status)
API timeout, KBA temporarily unavailable, or status `ERROR` with technical `errorInfo`. Backend auto-calls `POST /applications/{id}/retry` (no data change) **once**; customer not notified, no refund started. Retry succeeds → 5a. Otherwise classified: technical API error → correctable (5b); technical error on our side → 100 % refund. Line between the two: open (Q9). Never ask customer to resubmit — risks duplicates.

### J7 — Payment problems
Card declined / 3DS abandoned → `payment_intent.payment_failed`, application never started; customer stays on payment step with Stripe's message. SEPA Direct Debit captured at checkout but settles over several business days and can still fail afterwards — whether a SEPA order starts before settling: open (Q12). Card hold lasts 7 days; Verimi wait plus manual-processing authority can exceed that. Launch-plan assumption until Q7 answered: capture when Zulex accepts the application if authority online, otherwise on `FINISHED`; email re-authorisation request if hold nears expiry.

### J8 — Duplicate submission
Double-click / refresh on "Pay & submit": idempotency key makes API call safe; Stripe PaymentIntent likewise idempotent. Same vehicle deliberately submitted twice (two sessions): API accepts both; KBA rejects the second. Cheap guard: warn if same plate+VIN has an open application from us.

### J9 — Authority offline or unavailable
`GET /registration-authorities?licencePlatePrefix=…` before payment. `online` → normal expectations ("usually minutes to hours"). `unavailable`/`offline` → **manual processing**: tell customer before payment it may take days. Always use this endpoint in the eligibility step.

### J10 — Status tracking, lost link, unknown status
One-time link → personal status dashboard (no account) with seven customer statuses and documents. Lost link → "Resend my link" by email + order ID (launch-plan assumption; send to stored address only — never reveal data on-page from an email guess). Unknown status tag from API (spec explicitly warns of new statuses) → render generic "In progress" step, don't break.

### J11 — Special plates (edge case)
Seasonal (Saisonkennzeichen), electric (E), historic (H) plates: deregistration request has **no `licencePlateAttributes`** (other flows do). If KBA needs E/H suffix, these vehicles may be rejected. Clarify with API provider; until then exclude them in eligibility check or expect J4/J5 outcomes.

### J12 — Identity verification (Verimi)
After status 1: email 2 with Verimi link; selfie + ID-card scan (~90 s). Success → status 3, email 3, then KBA submission. Failure → 5c (refund minus 19.99 €). Email 2 names a deadline; its length, any reminder, outcome when it passes: open (Q14). Who integrates Verimi, who sends the link, how ZulexGO learns the result: open (Q1–Q3).

---

## API & business problems to flag

1. **Status granularity is the biggest gap.** Founder wants 7 customer-facing steps; API `Status` enum has 3 (`IN_PROGRESS`, `FINISHED`, `ERROR`), GET response has **no timestamps**. Statuses 1–3 (submitted & paid, waiting for identity verification, verified) don't exist in the API — backend owns its status machine, maps only 4, 5a, 5b, 5c from API. `/lists/application-statuses` hints at richer status tags absent from the response schema — ask provider how to obtain them.
2. **Identity verification isn't in the API.** Business logic requires Verimi step (statuses 2–3); Zulex API has no Verimi field, endpoint or status. Separate integration, and a drop-off point. Legally, de-registration is authorized by the physical security codes, so whether it needs Verimi at all: open (Q4).
3. **No webhooks for applications** (only notices mention one; no subscription endpoint in spec). Status emails require backend polling, respecting `429`/`Retry-After`.
4. **Error responses have no schema.** 4xx/5xx bodies undefined; meaningful messages only in `errorInfo` on the GET. All customer-facing error text must be ours.
5. **Rejection vs. technical error is ambiguous** (rejection = `ERROR`, or `FINISHED` + `REJECTION` document?); correctability not signaled. Blocked on provider clarification.
6. **Secrets are echoed back.** GET returns all security codes in plaintext; status link is unauthenticated by design. Never render codes on status page, never put them in emails or logs; link tokens long, random, revocable.
7. **The API key is a B2B merchant credential.** Every call via our server; key must never reach the browser.
8. **No cancellation endpoint.** Once submitted, customer can't withdraw; business logic's cancel option exists only after correctable failure (5b), when nothing is pending at KBA. T&Cs and right of withdrawal shown before payment; how the 14-day right interacts with the 19.99 € processing fee, and whether an immediate-performance waiver is still needed: open (Q13). Mandatory: AGB, Impressum, privacy policy (GDPR: VIN + plate + codes + email are personal data — minimize, encrypt, define retention), full price display incl. authority fees (PAngV).
9. **Fraud, realistically:** founder is right that third-party deregistration is hard (physical documents required). Remaining B2C risks: brute-forcing status-link tokens (rate-limit + long tokens), card fraud/chargebacks (pre-auth reduces exposure), seller de-registering a car after handing it over (dispute handling policy, keep audit trail).
10. **Documents API returns a bare binary**, no filename/content-type metadata; handle `UNKNOWN` document types and unknown alert tags gracefully.
11. **Spec sloppiness:** POST `404` "application with the given ID does not exist" on a *create* endpoint, `*/*` content types, zero-length idempotency keys allowed. Harmless, but the error contract needs the follow-up the founder promised.
