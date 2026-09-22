# De-registration (Außerbetriebsetzung) — User Journeys & API Findings

Scope: B2C MVP built on `POST /deregistration-applications`, `GET /deregistration-applications/{id}`, `PATCH /deregistration-applications/{id}`, `POST /applications/{id}/retry`, `GET /documents/{id}`.

## Data the customer must provide

| Field | Constraint | Notes |
|---|---|---|
| Licence plate (prefix, letters, numbers) | `[A-ZÄÖÜ]{1,3}` / `[A-Z]{1,2}` / 1–4 digits, no leading 0 | Required |
| Rear plate security code | 3 alphanumeric | Required (scratched off the rear plate seal) |
| Front plate security code | 3 alphanumeric | Only for two-plate vehicles (cars). API cannot enforce this — the UI must ask "one plate or two?" |
| Security code, registration certificate part 1 | 7 alphanumeric | Required (scratched field on the Zulassungsbescheinigung Teil I) |
| VIN | 1–17 chars `[A-Z0-9]` | Required. API pattern is loose; UI should expect 17 chars for modern vehicles but allow shorter for old ones |
| `reserveLicencePlate` | boolean | Out of scope — always omit/send `false` (founder decision) |
| Email, payment | — | **Not part of the API.** Ours to collect for Stripe, status emails, and the one-time link |

Always send `X-Idempotency-Key` (one per checkout attempt) so a network retry can never create two applications and two charges.

---

## Journeys

### J1 — Happy path (two-plate car)
Customer selects "De-register vehicle" → eligibility check (German plate, has Teil I document and plate seals intact, authority reachable) → enters plate, VIN, scratches and enters the 3 codes (front, rear, certificate) → sees price, pays (Stripe pre-authorization) → gets reference number + one-time status link + confirmation email. Backend submits to the API (`201`, `applicationId`), captures the payment, and polls status. `IN_PROGRESS` → "Submitted to KBA – waiting". `FINISHED` with a `DEREGISTRATION_CONFIRMATION` document → "Completed"; customer downloads the official confirmation PDF from the status page and receives a final email. Insurance and vehicle tax stop automatically via KBA — say so on the success screen.

### J2 — Happy path (motorcycle / trailer, one plate)
Same as J1, but the UI asked "how many plates?" first and never showed the front-code field. Omitting `frontLicencePlateSecurityCode` is valid — the API accepts it.

### J3 — Input rejected at submission (400)
Backend receives `400`. **Gap: the spec defines no response body for 4xx errors**, so field-level mapping is not guaranteed. Mitigation: validate everything client-side before payment (patterns above, scratch-code length, checksum-ish VIN checks) so a 400 is rare. If it still happens: do not capture the pre-authorization, show "We couldn't submit your application — nothing was charged," and return the user to an editable form.

### J4 — Rejected by the authority, correction possible
Status polling shows the application failed with `errorInfo` (code, description, details) and/or a `REJECTION` document. Customer gets an email + status page shows "Rejected – you can correct your data," displaying the human-readable reason. They re-enter the wrong field(s); backend sends `PATCH` with only the corrected fields, which resubmits to KBA. Journey continues at J1's polling step. No extra charge.
**Gap: nothing in the API says whether a rejection is correctable.** The UI must infer it from `errorInfo.code` — we need the error-code catalogue from the API provider (founder is clarifying).

### J5 — Rejected, correction not possible
E.g. vehicle already deregistered, plate/VIN mismatch confirmed by KBA, alerts against the vehicle. Status page shows a terminal "Rejected" state with the reason and what to do offline (visit the Zulassungsbehörde). **Business decision needed: full or partial refund** — with pre-authorization we can release the hold if we haven't captured yet; if captured, issue a Stripe refund. State the refund policy in the AGB and on this screen.

### J6 — Technical error (ERROR status)
API status `ERROR` with `errorInfo` = technical fault, not a rejection. Backend calls `POST /applications/{id}/retry` (no data change) automatically with backoff; customer just sees "Processing is taking longer than usual." Only escalate to a visible error + support contact if retries keep failing. Never ask the customer to resubmit — that risks duplicates.

### J7 — Payment problems
Card declined / 3DS abandoned → application is never created; customer stays on payment step with Stripe's message. Pre-authorization succeeds but API submission fails permanently → release the hold, email "not charged." Auth expires (~7 days) before completion (manual-processing authority) → either capture at submission instead, or re-request payment; decide per `ikfzStatus` (see J9).

### J8 — Duplicate submission
Double-click / refresh on "Pay & submit": idempotency key makes the API call safe; Stripe PaymentIntent is likewise idempotent. Same vehicle submitted twice deliberately (two sessions): the API will accept both; second one will be rejected by KBA. Cheap guard: warn if the same plate+VIN has an open application from us.

### J9 — Authority offline or unavailable
`GET /registration-authorities?licencePlatePrefix=…` before payment. `online` → normal expectations ("usually minutes to hours"). `unavailable`/`offline` → application goes to **manual processing**: tell the customer up front that it may take days, before they pay. This endpoint is a UX gift the flow should always use in the eligibility step.

### J10 — Status tracking, lost link, unknown status
Customer opens the one-time link → personal status dashboard (no account) with the 7-step journey and documents. Lost link → "Resend my link" by email + reference number (send to the stored address only — never reveal data on-page from an email guess). Unknown status tag from the API (spec explicitly warns of new statuses) → render a generic "In progress" step rather than breaking.

### J11 — Special plates (edge case)
Seasonal (Saisonkennzeichen), electric (E), historic (H) plates: the deregistration request has **no `licencePlateAttributes`** (other flows have it). If KBA needs the E/H suffix, these vehicles may be rejected. Clarify with the API provider; until then, either exclude them in the eligibility check or expect J4/J5 outcomes.

---

## API & business problems to flag

1. **Status granularity is the biggest gap.** The founder wants 7 customer-facing steps; the API `Status` enum has 3 (`IN_PROGRESS`, `FINISHED`, `ERROR`) and the GET response has **no timestamps**. Steps 1–3 (submitted & paid, waiting for ident, ident done) don't exist in the API at all — our backend must own its own status machine and only map steps 4–7 from the API. `/lists/application-statuses` hints at richer status tags, but they don't appear in the response schema — ask the provider how to obtain them.
2. **Identity verification isn't in the API.** If we do ident (legally, deregistration is authorized by the physical security codes, so ident is our own risk/compliance choice), it's an entirely separate integration and a place where users can drop off — needs its own reminder emails.
3. **No webhooks for applications** (only notices mention one, with no subscription endpoint in the spec). Status emails require our backend to poll, respecting `429`/`Retry-After`.
4. **Error responses have no schema.** 4xx/5xx bodies are undefined; meaningful messages exist only in `errorInfo` on the GET. All customer-facing error text must be ours.
5. **Rejection vs. technical error is ambiguous** (is a rejection `ERROR`, or `FINISHED` + `REJECTION` document?) and correctability is not signaled. Blocked on provider clarification.
6. **Secrets are echoed back.** The GET response returns all security codes in plaintext, and the status link is unauthenticated by design. Never render the codes on the status page, never put them in emails or logs, and make link tokens long, random, and revocable.
7. **The API key is a B2B merchant credential.** Every call goes through our server; the key must never reach the browser.
8. **No cancellation endpoint.** Once submitted, the customer cannot withdraw the application. Legally (German consumer law) we must obtain explicit consent to immediate performance and waiver of the 14-day withdrawal right at checkout, or we owe refunds. AGB, Impressum, privacy policy (GDPR: VIN + plate + codes + email are personal data — minimize, encrypt, define retention) and full price display incl. authority fees (PAngV) are mandatory.
9. **Fraud, realistically:** the founder is right that third-party deregistration is hard (physical documents required). Remaining B2C risks: brute-forcing status-link tokens (rate-limit + long tokens), card fraud/chargebacks (pre-auth reduces exposure), and a seller de-registering a car after handing it over (dispute handling policy, keep an audit trail).
10. **Documents API returns a bare binary** with no filename/content-type metadata; handle `UNKNOWN` document types and unknown alert tags gracefully.
11. **Spec sloppiness:** POST `404` "application with the given ID does not exist" on a *create* endpoint, `*/*` content types, zero-length idempotency keys allowed. Harmless but signals the error contract needs the follow-up the founder promised.
