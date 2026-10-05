# ZulexGO — Neuzulassung (vehicle registration) launch plan

## Context

The second service after de-registration: **Neuzulassung**, registering a brand-new car that has never had plates, on the Zulex endpoints `POST /registration-applications`, `GET` and `PATCH /registration-applications/{id}`, plus the shared `POST /applications/{id}/retry`, `GET /documents/{id}` and `GET /registration-authorities`. Price on the founder's list: 129 € (`SERVICE_PRICES.newRegistration` in `src/core/domain/payment/pricing.ts`).

**How this plan relates to the others.** [launch-plan.md](launch-plan.md) stays the source of truth for every rule both services share: the status machine, the error algorithm, payment, capture, refunds, emails, polling, idempotency, legal baseline. This plan owns only what is specific to Neuzulassung. Its open questions are numbered Q45–Q56 and live in launch-plan.md with the others; the plan's milestones are numbered **N0–N10** so they never collide with M0–M9. Per your earlier instruction: **no sizing or dates — ordering and exit criteria only.**

**What already works for both services** (no change needed): the status machine's core transitions, the error algorithm and its one silent retry, the refund and hold policies, the poll schedule, `retry`, document fetching and storage, status tokens and the resend-link flow, rate limits, cancel at 5b, the mail port, the Postgres migrator.

**What assumed de-registration when this plan was written** (no part of the code knew which service an order is for; N1 to N7 resolved each of these):
- `Application.request` is a `DeregistrationRequest`; there is no service field on the entity, no `service` column, and the `applications` table requires plate and security-code columns.
- `RegistrationGateway.submitDeregistration`, and `getStatus` and `correct`, which the Zulex adapter sends to `/deregistration-applications/{id}`; `Correction` carries de-registration fields only; `findAuthorities` asks by plate prefix only.
- `DEREGISTRATION_TOTAL` in checkout, review step, FAQ and seed; `service_type: "deregistration"` hard-coded in the Stripe adapter.
- `correction.ts`, `correct-application.ts`, `get-status-by-token.ts` (`StatusView`), the status page, the funnel, `app/_components/vehicle-data.ts`, the landing CTA (`href="/deregister"`), and the wording in `src/adapters/mail/resend/copy.ts`.
- The Stripe browser SDK is allowed only in `app/(funnel)/deregister/_components/stripe/` (lint rule `STRIPE_UI_FOLDER`).
- The Zulex adapter maps `REGISTRATION_CONFIRMATION` and `TEMPORARY_REGISTRATION_CERTIFICATE` to `unknown`.
- `IdentityVerification` has a port and a fake, but no use case calls it and no `IDENTITY_DRIVER` exists.

---

## Status (2026-10-05)

N1 to N7 are built and merged into `staging`; N0, N8, N9 and N10 are not. **Neuzulassung is not on sale**: `newRegistration` is not in `SERVICES_ON_SALE`, so `/register` is not found, the landing card says "Bald verfügbar" and `submitCheckout` refuses the service. It runs end to end on the fakes and the msw doubles; no real order has gone through it.

| Milestone | State | Pull requests | What was built, and where it differs from the text below |
|---|---|---|---|
| N0 | Skipped by the founder | none | Verimi is down as a service and no identity vendor is chosen; the lawyer texts, the AGB and the power of attorney come later. Q45–Q56 are unanswered. |
| N1 | Merged 2026-10-03 | #70, #71 | Migration `0008_add_application_service`. The service lives in `request.service`; there is no `Application.service` field. The Stripe Payment Element moved to `app/(funnel)/_components/stripe/`. |
| N2 | Merged 2026-10-04 | #72 | Value objects, the request schema, `new-registration-correction.ts` (then part of `correction.ts`), the verification deadline and reminder, the glossary. The status machine takes the service: `DIRECT_SERVICES` names the services that skip the identity check. Migration `0009_add_identity_verification_statuses` holds the two statuses only. |
| N3 | Merged 2026-10-04 | #73 | Migration `0010_add_new_registration_details` (the plan called it `0009`): `encrypted_details`, the verification id and deadline, a check that each service fills its own columns, an index on `(service, vin)`. `ServiceRequest` is a union. |
| N4 | Merged 2026-10-04 | #74 | The Zulex adapter and the fake file, check, patch and fetch documents per service (`Corrections` per service on the gateway); document kind `temporaryCertificate`. **The spike is not done**: it needs a `ZULEX_API_KEY` for the integration environment, and `docs/registration-user-journeys.md` does not exist yet. |
| N5 | Merged 2026-10-05 | #75 | `confirmPayment` starts the verification; `checkIdentityVerification` runs from the poller and from `/api/webhooks/identity`; emails 2, 3 and the reminder; migration `0011`. **Only a fake identity adapter exists**; there is no Verimi adapter. |
| N6 | Merged 2026-10-05 | #76 | The funnel `/register` and the parts both funnels share (`app/(funnel)/_components/`); consent stored with the order (D9) with a third checkbox for the power of attorney; migration `0012_record_consent`; `docs/site-contract.md` §4. |
| N7 | Merged 2026-10-05 | #77 | The status page, the correction form, cancel and emails 1, 4, 5a, 5b and 5c for a Neuzulassung; `docs/site-contract.md` §5. `new-registration-correction.ts` became its own module. |
| N8 | Not started | none | Lawyer texts, retention (nothing erases the IBAN when an order ends), rate limits on the eligibility lookup and checkout, the threat-model addendum. |
| N9 | Not started | none | Needs the production stack (launch-plan M8), the Zulex API with Neuzulassung enabled and a real identity adapter; production already refuses the fake identity check while a service that verifies is on sale. |
| N10 | Not started | none | Plates, sticker and shipping (Q41, Q50). |

Where the built code departs from the text of this plan:

- **A correction of the owner's name and birth date** is possible only while the order's identity was never verified (a verification found someone other than the owner, Q47), not "before anything is filed": once the person was verified they were checked against that name. A refused filing after verification can change only the eVB number and the Teil II.
- **The assigned plate is not read from the API** (the response does not carry it): the status page and email 5a say it is printed in the temporary certificate, an assumption until the N4 spike shows where it appears.
- **The verification deadline counts from the payment**, the reminder from reaching status 2, so a retried email 2 repeats the deadline the customer was given (Q48).
- **Consent** has three checkboxes for a Neuzulassung (AGB with the withdrawal notice, the early-start waiver, and a power of attorney that also carries the direct-debit mandate), their text versions stored with the order (Q46, D9).
- **Seeded orders**: one Neuzulassung per status (`ZG-SEED11` to `ZG-SEED19`). There is none for "5b after an identity mismatch" or "cancelled because the verification ran out", which the status page also shows.

Every answer the code gives to Q45–Q56 is a provisional one, listed with its "if the founder answers differently" pointers in [launch-plan.md](launch-plan.md).

---

## Scope at launch

Plan defaults, each tied to an open question so the founder can widen it:

| In | Out (for now) |
|---|---|
| Cars (`vehicleType: CAR`) | Motorcycles, 125s, quads, trailers, trucks (Q49) |
| Private persons aged 18 or over, living in Germany, who will be the keeper (Halter) | Legal entities, minors, ordering for someone else (PRD, Q24, Q49) |
| Brand-new vehicles with a manufacturer-issued Teil II that carries a concealed security code | Used imports, vehicles needing a COC or HU check, Teil II without a code (Q49, Q56) |
| Standard registration (`admissionType: STANDARD`), normal use (`vehicleUsage: NORMAL`) | Day registration (`SINGLE_DAY`), taxi, rental (Q49) |
| A plate assigned by the authority; E-plate for electric cars; seasonal plate | Wish plate with a reservation PIN (Q51), H-plate |
| Documents shipped by the authority to the owner's address (`SHIPPING`) | Pick-up, a different address for Teil II (Q55) |
| Identity verification before filing (statuses 2 and 3) | Launch without it (Q45) |
| Card payment, Apple Pay, Google Pay (as de-registration, Q12) | Plates, fine-dust sticker, shipping, THG-Quote (Q41, Q42, Q50 → N10) |

## What the customer must provide

Every field is in the API's create request (`CreateRegistrationApplicationRequest`). "Secret" means encrypted at rest, never in logs, emails, status pages, URLs or committed fixtures.

| Field | API path | Constraint | Secret |
|---|---|---|---|
| eVB number (insurance confirmation) | `evbNumber` | 7 chars `[A-HJ-NP-Z0-9]` (no I, no O); we anchor the spec's unanchored pattern | yes |
| Teil II number | `registrationCertificateInfo.registrationCertificatePart2Number` | 1–20 chars; exact format to confirm (Q56) | no |
| Teil II security code | `registrationCertificateInfo.registrationCertificatePart2SecurityCode` | spec says only `minLength: 1`; format to confirm (Q56) | yes |
| VIN | `vehicleInfo.vin` | `[A-Z0-9]{1,17}` in the API; we require exactly 17, as a new car has | no |
| Engine type | `vehicleInfo.engineType` | `ELECTRICAL`, `HYBRID`, `COMBUSTION` (`NO_ENGINE` not offered for a car) | no |
| Vehicle type, usage | `vehicleInfo.vehicleType`, `vehicleUsage` | fixed `CAR`, `NORMAL` at launch | no |
| Owner: first and last name, gender, birth date, birth place, phone, email | `ownerInfo.personalInfo` (`source: REQUEST_FOR_INDIVIDUAL_PERSON`) | all required by the API; gender `FEMALE`/`MALE`/`DIVERSE`/`UNSPECIFIED` | yes (birth date, birth place, phone) |
| Owner address | `ownerInfo.personalInfo.address` | street, house number `^(\d{1,4})(?!\d)(.*)$`, 5-digit postcode, city | yes |
| Delivery | `ownerInfo.deliveryInfo` | `SHIPPING` to the owner's name and address | — |
| Bank account for vehicle tax | `ownerInfo.sepaInfo` | German IBAN (checksum), BIC, bank name; the country is the IBAN's, not asked; optional in the spec, but vehicle tax is collected by direct debit, so treated as required until Zulex says otherwise (Q56) | yes |
| Plate options | `admissionInfo.licencePlateInfo.licencePlateAttributes` | electric (only for `ELECTRICAL`), seasonal with months 1–12, historic always `false` | no |
| Order email | the keeper's email, `ownerInfo.personalInfo.email` | one field: it is also where the status link, the verification link and every status email go | no |

Postcode of the owner's address also picks the authority: `GET /registration-authorities?postcode=…` (a car is registered where its keeper lives, not by plate prefix).

## The order's life

`awaiting_payment` → **1** paid → **2** waiting for identity verification → **3** identity verified → **4** filed with Zulex, KBA processing → **5a** | **5b** | **5c**, plus `cancelled`.

- De-registration keeps running 1 → 4 (Q4); Neuzulassung runs every step. The status machine gets the two Verimi statuses it already reserves room for, and a per-service path.
- **Zulex is called at 3 → 4**, after verification, as business-logic §1 orders the steps ("the application can now be submitted to the KBA"). Nothing reaches Zulex or the KBA before the customer's identity is confirmed (Q5 for this service).
- Emails: 1, 2, 3, 4, 5a, 5b, 5c, 6, plus a verification reminder (Q48).
- Failure classes (business-logic §2, Q53): wrong eVB or Teil II data, plate unavailable → **5b**; wrong owner data, wrong address, identity verification failed → **5c** (129 € − 19.99 € = 109.01 € back). Zulex's `PATCH` can change only the eVB, the Teil II number and code, and a wish plate, which is why the rest cannot be corrected once filed.
- A card is held at checkout and captured as launch-plan Q7 and Q20 say; the verification wait now runs on the hold, so its deadline must end before the hold's capture margin (Q48).

---

## Default technical decisions (overridable; none blocks a milestone)

| Decision | Default | Why |
|---|---|---|
| Service key | `newRegistration`, the key `pricing.ts` already uses; also the Stripe `service_type` value | One name in every layer. `registration/` in `src/core` already means "filing with the KBA" (error algorithm, poll schedule), so the service is never called just "registration" in code. |
| Route | `app/(funnel)/register/`, confirmation at `/register/bestaetigung` | Mirrors `/deregister`. There are no accounts, so "register" cannot be misread as sign-up. |
| Order shape | `request` becomes a union discriminated by `service` (built as `ServiceRequest`; the service is `request.service`, there is no `Application.service`) | The use cases that are already generic stay untouched; the compiler finds every place that assumed de-registration. |
| Storing owner data | One AES-GCM blob `encrypted_details` (JSON of owner, address, phone, bank account, Teil II, eVB, plate choice), the order reference as associated data, through the existing `FieldCipher`; only `service` and `vin` in plain columns | Same scheme as the security codes since migration `0001`; the VIN stays plain for the duplicate warning. The GET response echoes all of this back, so the adapter never logs a response body. |
| Authority lookup | `findAuthorities` takes `{ prefix }` or `{ postcode }`; the slowest status of several still wins (`combinedIkfzStatus`) | A postcode can span districts as a prefix can. |
| Identity verification | The existing `IdentityVerification` port; `IDENTITY_DRIVER` takes `fake` only until the Verimi adapter exists; production refuses `fake` while a service that verifies is on sale (`fakeIdentityProblem` in `src/config/env.ts`) | De-registration can launch in production without Verimi; Neuzulassung cannot go on sale on a fake. |
| Which services are sold | A domain list (`SERVICES_ON_SALE`) read by the landing page **and** checked by `submitCheckout` | Before N1, `available: false` only hid a card; nothing on the server stopped a crafted checkout for an unsold service. |
| Form state | In memory only, never in the URL or browser storage; a leave-page confirmation once the form has data | The form holds an IBAN and a birth date; keeping them out of storage outweighs losing a half-filled form on reload. |
| Stripe Payment Element | Moves to `app/(funnel)/_components/stripe/`; lint and the `project-structure` and `external-services` skills follow | Both funnels pay the same way; the lint rule names one folder. |
| Verimi adapter | Written only once Q1–Q3 are answered and a source for its API exists; no Verimi MCP exists today, so Mark is told before any adapter code | The `external-services-via-MCP` rule. |

---

## Critical path

```
N0 Questions out, lead-time items started (no code) ───────────────────────────────┐
N1 One order, many services (refactor; de-registration behaves exactly as before)  │
 → N2 Neuzulassung domain rules                                                     │
    → N3 Persistence ──────┐                                                        │
    → N4 Zulex adapter ────┼→ N7 Status page, emails, documents, correct and cancel │
    → N5 Identity step ────┘                                                        │
    → N6 Funnel /register (on fakes, parallel to N3–N5)                             │
 → N8 Legal, privacy, security (lawyer texts started in N0) ←───────────────────────┘
 → N9 Staging run → beta → on sale   (needs launch-plan M8, the Zulex API, Verimi)
   N10 Plates, sticker, shipping (after launch; Q41, Q50)
```

N1 needed neither the Zulex API nor the founder. Neuzulassung goes on sale only after de-registration is public (M9), because it needs M8's production stack and the poller's cron (launch plan D1); stored consent (D9) is built.

---

## Milestones

### N0 — Questions out, lead-time items started

**Goal:** Every answer and external dependency Neuzulassung needs is asked for before code depends on it.

**How (no code):**
- Q45–Q56 are in launch-plan.md (added with this plan). Send Q45–Q55 to the founder and Q56 to the Zulex API team, together with Q23's.
- Lawyer: AGB section for Neuzulassung; the power of attorney (Q46); the wording of the direct-debit mandate for vehicle tax; privacy-policy additions (owner data, IBAN, Verimi's ID and selfie processing); whether the larger data set needs a data-protection impact assessment.
- Verimi: contract and integration route (Q1–Q3). For Neuzulassung this is on the critical path, not "added later".
- Beta vehicles: line up at least three brand-new cars whose owners will register through ZulexGO (founder network or a dealer). A real beta cannot be simulated.
- Plate supplier, only if Q50 says plates are sold at launch.

**Exit criteria:** questions logged and sent, each with someone chasing it; Zulex has confirmed whether Neuzulassung for private persons is enabled on our account and in the integration environment, or the "no" is recorded as a blocker.

**Tests:** none — no code.

---

### N1 — One order, many services

**Goal:** The code knows which service an order is for, so Neuzulassung is added beside de-registration instead of through it. De-registration behaves exactly as before.

**Why first:** every later milestone touches the entity, the gateway, the repository, the copy and the funnel. Generalising once, behind the full existing test suite, is cheaper and safer than threading a second service through code that assumes the first.

**How:**
- `Service` moves from `pricing.ts` to `src/core/domain/application/service.ts`; `Application` gains `service`; `request` becomes `ServiceRequest`, a union with one member until N2. `DEREGISTRATION_TOTAL` gives way to `SERVICE_PRICES[service]` in `submit-checkout.ts`, the review step, the FAQ and the seed.
- `SERVICES_ON_SALE = ["deregistration"]`; `submitCheckout` refuses any other service; `service-selection.tsx` reads the list and takes its CTA link and label per service.
- `RegistrationGateway`: `submitDeregistration` → `submit(request: ServiceRequest, key)`; `getStatus` and `correct` take the service with the id (Zulex's path differs per service); `Correction` becomes a union per service; `findAuthorities` takes `{ prefix } | { postcode }`. Contract, fake and Zulex adapter follow (a path table per service). `ApplicationRepository.hasOpenApplication` takes `{ service, vin, licencePlate? }`.
- `PaymentProvider.createPayment` takes the service; Stripe metadata `service_type` comes from it.
- `copy.ts`: de-registration wording moves into a per-service table; the reviewed HTML snapshots must not change.
- `StatusView` carries the service; the status page picks its summary and correction form by service.
- Stripe Payment Element folder moved, `STRIPE_UI_FOLDER` and the two skills updated.
- Migration `0008_add_application_service`: `service text NOT NULL DEFAULT 'deregistration'` with a check against the known services; `down.sql` drops it.
- Seed: journeys keyed by service and status; the seven existing references and tokens (`ZG-SEED01`–`07`) do not move (built: the Neuzulassung orders are `ZG-SEED11`–`19`).

**Tested:** checkout refuses a service that is not on sale (a security boundary, not a UI detail); Stripe metadata carries the order's service; the Postgres adapter round-trips `service`; the migration rehearsal includes `0008`. Everything else is proven by the existing suites passing with only renamed calls.

**Exit criteria:** full suite and migration rehearsal green with **no changed assertion** in `tests/integration/deregistration-*.test.ts`, `status-notifications.test.ts` or `correction-and-cancellation.test.ts`; email snapshots byte-identical; on staging `0008` applies on deploy and every `/status/seed-status-link-*` still opens.

---

### N2 — Neuzulassung domain rules

**Goal:** Every rule the API and the business logic set for Neuzulassung exists as pure, tested code, before any adapter or screen uses it.

**How (test-first):**
- `src/core/domain/application/new-registration-request.ts` (zod, shared with the browser as de-registration's is), composed of value objects:
  - `vehicle/`: `evb-number.ts`, `registration-certificate-part2.ts` (number and security code), `engine-type.ts`; `Vin` reused.
  - `customer/`: `owner.ts` (names, gender, birth date checked against the `Clock` for 18+, birth place, phone), `postal-address.ts`, `bank-account.ts` (IBAN checksum, BIC, bank name, country).
  - Plate choice: assigned by the authority, attributes electric (only with `ELECTRICAL`) and seasonal (months 1–12). A wish plate with PIN only if Q51 says so.
  - Secret value objects print a placeholder from `toString` and `toJSON`, as `SecurityCode` does.
- `application-status.ts`: `awaiting_identity_verification` (2) and `identity_verified` (3), events for verification started, verified, failed and expired; a per-service path so de-registration still goes 1 → 4. Statuses 2 and 3 join `OPEN_STATUSES` and `POLLED_STATUSES` (deadline, reminder and hold checks at 2; filing resumed at 3).
- `customer-steps.ts`: five rows for Neuzulassung (1, 2, 3, 4, outcome).
- `correction.ts`: Neuzulassung corrects the eVB and the Teil II number and code (Q53), and, only before anything is filed, the owner's name and birth date after a verification mismatch (Q47); the form starts empty, as Q26 settled for de-registration.
- Verification deadline and reminder as a pure function beside `hold-policy.ts` (Q48), with a test that the deadline plus `HOLD_CAPTURE_MARGIN_MS` ends inside a card hold's lifetime.
- `rejection-catalogue.ts` gains a service dimension only if Zulex's codes differ per service (Q56).
- `docs/domain-glossary.md`: eVB, Teil II security code, Halter, Wunschkennzeichen, the vehicle-tax direct-debit mandate, the temporary registration certificate — facts only.

**Tested:** every validation boundary (IBAN checksum, eVB alphabet without I and O, the 18th birthday with a frozen clock, house-number pattern, postcode, seasonal months, E-plate only for electric); every new status transition and that de-registration never enters 2 or 3; that no secret appears in `JSON.stringify` or `String()` output.

**Exit criteria:** the above green; `parseNewRegistrationRequest` accepts the spec's example shape and rejects each broken field with its own path.

---

### N3 — Persistence

**Goal:** A Neuzulassung order survives between checkout, verification, filing and every poll, with its personal data encrypted.

**How:**
- Migration `0010_add_new_registration_details` (built as `0010`: the two statuses went into `0009_add_identity_verification_statuses` with N2): `encrypted_details`; the de-registration plate columns and `encrypted_security_codes` become nullable, with a check that each service has its own columns filled; the `application_status` domain gains the two Verimi statuses; columns for the verification id and deadline. `up.sql`, `down.sql`, `README.md` each.
- Postgres adapter and fake both pass the repository contract, which gains a Neuzulassung case per status, a correction, and a test that reads the raw row and finds no IBAN, birth date, eVB or Teil II code in plain text.
- Duplicate warning (J8, Q38) by VIN for an open Neuzulassung order; index on `(service, vin)`.
- Seed: one Neuzulassung order per status, with obviously fake data (a checksum-valid example IBAN, `example.test` addresses), openable by its own seed token; the coverage test iterates service × status.

**Exit criteria:** migration rehearsal green (up → down all → up); both adapters pass the same contract; seed coverage per service green; loading the seed with `APP_ENV=production` still throws.

---

### N4 — Zulex adapter for Neuzulassung

**Goal:** A Neuzulassung order can be filed, checked, corrected and its documents fetched through the Zulex adapter, proven against the spec at the network boundary.

**How:**
- `src/adapters/registration/zulex/`: build the create body (`ownerInfo` with `source: REQUEST_FOR_INDIVIDUAL_PERSON`, `personalInfo`, `deliveryInfo`, `sepaInfo`; `admissionInfo` `STANDARD` with plate attributes; `registrationCertificateInfo`; `vehicleInfo`; `evbNumber`), always with `X-Idempotency-Key`; read only `applicationId`, `status`, `documents`, `errorInfo` from a GET; `PATCH` with the changed fields only. Document kinds: `REGISTRATION_CONFIRMATION` → `confirmation`, `TEMPORARY_REGISTRATION_CERTIFICATE` → a new `temporaryCertificate` kind.
- `findAuthorities({ postcode })`.
- Fake gateway records Neuzulassung submissions; msw handlers in `tests/msw/zulex.ts` and fixtures in `tests/fixtures/zulex.ts` from the spec, validated by the adapter's zod schemas.
- **Spike**, as soon as the API is back (read-only, throwaway): create in the integration environment, see whether it reaches `FINISHED`, which documents arrive, where the assigned plate appears, induce a 400. Scrubbed fixtures into `tests/fixtures/zulex/`; findings into a new `docs/registration-user-journeys.md`.

**Tested:** the gateway contract for the Neuzulassung path via msw; the create body matches the spec's schema field by field; a response body that echoes personal data never reaches a log (the logs secrets test extended to every N2 secret).

**Exit criteria:** contract green on fake and Zulex adapter; spike done, or recorded as blocked by the API.

---

### N5 — Identity verification in the flow

**Goal:** A paid Neuzulassung order waits for the customer's verified identity before anything is filed, and every way the wait can end is handled.

**How:**
- `confirmPayment` for Neuzulassung starts the verification (status 2, email 2 with the link and deadline) instead of calling `submitToKba`.
- A use case reading the result, run by the poller for status 2 and, if the provider calls back, by a signature-verified route under `app/api/webhooks/`:
  - verified → 3, email 3, then `submitToKba`;
  - failed → 5c, refund minus 19.99 € (business-logic §2);
  - verified identity does not match the owner on the order → Q47;
  - deadline passed → Q48 (default: cancelled, hold released in full, email 6); reminder email before it.
- The hold guard visits status 2 like any polled order.
- `IDENTITY_DRIVER` in `src/config/env.ts` with its guardrail test; `identity` joins `Dependencies`.
- Verimi adapter `src/adapters/identity/verimi/` passing the existing contract — only once Q1–Q3 are answered and Mark has confirmed the source for Verimi's API. If the founder's answer to Q1 is that Zulex runs the verification, this milestone becomes a Zulex-backed adapter of the same port.

**Tested:** `tests/integration/identity-verification.test.ts` drives Neuzulassung through every transition with exactly one email each; deadline and reminder with fake timers; failure → 5c with the right refund; deadline → full release; an unsigned callback is rejected; nothing reaches Zulex before status 3.

**Exit criteria:** on fakes, an integration test runs a Neuzulassung order 1 → 2 → 3 → 4 → 5a end to end; the Verimi adapter passes the port contract, or is recorded as blocked.

---

### N6 — Funnel `/register`

**Goal:** A customer on a phone can enter everything Neuzulassung needs, see the full price and the fee notice, consent and pay.

**How:** one decision per screen, as the site contract asks:
1. **Voraussetzungen:** new car never registered; Teil II with a concealed code at hand; eVB from the insurer; customer will be the keeper, 18+, living in Germany; bank account for vehicle tax; postcode → authority availability notice. A "no" stops with the reason and the offline alternative.
2. **Fahrzeug:** VIN, engine type, Teil II number and code, eVB number, each with a locator image.
3. **Halter:** name, gender, birth date and place, address, phone, email.
4. **Kennzeichen:** assigned plate (wish plate only if Q51), E-plate offered only for electric cars, seasonal months.
5. **Kfz-Steuer:** IBAN, BIC, bank name, the mandate wording (from the lawyer).
6. **Prüfen & bezahlen:** masked summary, 129 €, the 19.99 € fee notice, consent to AGB and withdrawal, the power of attorney (Q46), the immediate-performance waiver (Q13), the Payment Element.
7. **Bestätigung:** reference, "link on its way", and that an identity-verification email follows.

The checkout action is per service and stores consent, so launch-plan D9 is fixed first. `docs/site-contract.md` gains a Neuzulassung funnel section with field limits.

**Tested:** per-step validation including IBAN feedback; contextual fields (E-plate only for electric, seasonal months only when chosen); back and forward keep the data; "Jetzt bezahlen" disabled until every consent is ticked; fee notice present before payment is possible; every input has an accessible name; the server refuses the checkout while the service is not on sale. **Not tested:** copy, progress indicator, locator images.

**Exit criteria:** the above green; checked in the browser on phone, tablet and desktop widths with the fake payment and the Stripe test mode.

---

### N7 — After filing: status page, emails, documents, correct and cancel

**Goal:** A Neuzulassung customer follows every step, downloads the documents at 5a, and can correct or cancel at 5b.

**How:**
- Status page for Neuzulassung: summary (car, VIN ending, the plate once known); five-row stepper; 5a with the documents (temporary certificate, confirmation, fee statement, Q28) and what arrives by post and what the customer does next (Q50, Q55); 5b with our reason, the correction form (eVB, Teil II) and cancel with the fee; 5c and cancelled with the refund.
- Copy per service in `copy.ts` for emails 1, 4, 5a, 5b, 5c (email 6 reads the same for every service; 2, 3 and the reminder from N5), each a reviewed snapshot; no personal data beyond the order reference and, once assigned, the plate.
- Correction: `PATCH /registration-applications/{id}`, or filed afresh after a 400 (Q37), which is why the full request is kept until the order ends.
- If the assigned plate is not in the API (Q56), the page names the document it is printed in.

**Tested:** a correction becomes the right `PATCH` body at the network (msw); rendered status HTML contains no IBAN, birth date, eVB, Teil II code or address (the required secrets test, extended); documents download only behind the token.

**Exit criteria:** the above green; `/status/seed-status-link-*` shows every Neuzulassung status on staging.

---

### N8 — Legal, privacy and security for Neuzulassung

**Goal:** Neuzulassung may lawfully be sold and holds far more personal data than de-registration without adding risk.

**How:**
- Lawyer-reviewed texts in place: AGB section, power of attorney, vehicle-tax mandate wording, privacy policy (owner data, IBAN, Verimi), the impact-assessment decision.
- Retention (Q22, Q54): the IBAN erased once the order ends; the rest per Q22; tested with the `Clock`.
- Rate limits on the Neuzulassung eligibility lookup and checkout.
- Threat-model addendum: registering a car in someone else's name, a stolen Teil II, personal data behind a leaked status link; `/security-review` of the branch.
- Price display (PAngV) for 129 € with the VAT wording of Q19 and Q52.

**Exit criteria:** no placeholder legal text on the Neuzulassung path; consent including the power of attorney stored per order (test); log-redaction test covers every N2 secret; retention test green.

---

### N9 — Staging run, beta, on sale

**Goal:** Real Neuzulassungen by a known group succeed in production before the service is offered to everyone.

**Needs:** launch-plan M8 (production, monitoring, the poller's cron), the Zulex API with Neuzulassung enabled, Verimi live (or Q45 answered "launch without it"), N0–N8 exit criteria met.

**How:**
- Staging: one run against the integration environment through Verimi's test mode to status 4, and to 5a if that environment finishes applications.
- Beta: `newRegistration` on sale behind an invite (launch plan M9's `LAUNCH_MODE`, per service), the cars lined up in N0: at least one online authority, one manual-processing authority, one electric car with an E-plate.
- Monitoring additions: orders stuck at status 2, verification failure and abandonment rates, 5c share (typos in data that cannot be corrected).
- Add `newRegistration` to `SERVICES_ON_SALE`; `service-selection.test.tsx` changes from one sold service to two.

**Exit criteria:** every beta order's status matched Zulex's at every check; each 5a's documents downloaded from production; the assigned plate shown or pointed to correctly; one deliberate 5b corrected (e.g. a wrong eVB) and resubmitted; zero personal-data findings in logs, emails or status pages; then the gate opens.

---

### N10 — Plates, sticker, shipping (after launch)

**Goal:** The founder's add-ons, once Q41 and Q50 are answered: ordered and charged only after the KBA has completed the registration, never if it rejects it.

**How:** a basket at review (`quote()` already splits checkout from after-completion), a second payment opened from 5a, a supplier port per `external-services`, the delivery address and its retention, email 5a's "plate shipping info". The answers decide the shape; launch-plan Q41 lists the files.

---

## Blocked items and the fallback if unresolved

| Item | Lands in | Fallback |
|---|---|---|
| Verimi route and contract (Q1–Q3, Q45) | N5 | Built and tested on the fake; production refuses the fake, so the service stays off sale |
| Zulex API down, or Neuzulassung not enabled (Q56) | N4, N9 | Adapter proven against the spec via msw; no staging run and no beta until it is up |
| Zulex error codes for Neuzulassung (Q53) | N2, N7 | Unknown code → one silent retry → 5b, as launch-plan Q10 |
| Assigned plate missing from the API (Q56) | N7 | Status page and email 5a name the document the plate is printed on |
| Lawyer texts (Q46, mandate wording, privacy) | N6, N8 | Placeholders in dev and staging; the service stays off sale |
| Plates (Q50) | N10 | Launch without; 5a says plates are made locally |
| Beta vehicles (N0) | N9 | None: the gate does not open without real registrations |

## Neuzulassung API findings to flag

From `docs/api-1.yaml`; confirm or correct in the N4 spike.

1. **The assigned plate is not in the GET response.** `GetRegistrationApplicationResponse` returns only the wish plate the request carried. A customer without a wish plate learns the plate from a document only, and N10's plate order cannot read it.
2. **No proof of identity or power of attorney for a private person.** The individual-owner source carries data, not a proof; `PERMANENT_POA` is the dealer path. On whose authority Zulex files, and how the owner's identity reaches the authority, is Q1 and Q46.
3. **`sepaInfo` is optional** though vehicle tax is collected by direct debit; there is no field for an account holder other than the owner.
4. **The Teil II security code has no format** (`minLength: 1` only); the Teil II number is 1–20 chars with no pattern.
5. **The response echoes owner data, IBAN, eVB and the Teil II code in plain text.** Never log a response body.
6. **`PATCH` cannot change owner, address, bank or vehicle data**, so any error there is final after filing. Our validation before payment has to be strict (IBAN checksum, postcode, house-number pattern), since a typo there costs the customer 19.99 €.
7. **Wish plates need a PIN from a reservation made elsewhere**; the API has no reservation endpoint and no way to drop a wish plate in a `PATCH`.
8. **No vehicle data beyond VIN, type and engine** (no COC, no inspection): only vehicles with a manufacturer-issued Teil II can use this path.
9. **`PICKUP` is undefined for a private customer**, and nothing says whether the original Teil II must be sent to the authority.
10. **The eVB pattern is unanchored** (`[A-HJ-NP-Z0-9]{7}` matches inside a longer string); we anchor ours.
11. **The same gaps as de-registration:** three statuses, no timestamps, no webhook, no error body schema (`docs/deregistration-user-journeys.md` § API & business problems).

## Risks

- **N1 changes the de-registration code before its launch.** Mitigation: no changed assertion in its integration tests, byte-identical email snapshots, a staging deploy before merge to `main`. The alternative is to start N1 after M9; it only delays Neuzulassung.
- **Personal data volume.** A breach now exposes names, birth dates, addresses and bank accounts. Encryption at rest, erasing the IBAN at the end, and the redaction tests are the controls; the impact assessment decides whether more is needed.
- **Drop-off.** Seven funnel screens plus a verification step after payment. Monitored in N9; the verification reminder is the one lever before launch.
- **5c from typos.** Owner data cannot be corrected after filing (finding 6); checks before payment are the mitigation, plus Q47 for mismatches found during verification.
- **Card hold vs. verification wait.** Covered by the deadline in Q48 and the existing capture-ahead-of-expiry rule (Q20).
- **The beta needs real new cars.** Lined up in N0, or the gate waits.

## Critical files

- `src/core/domain/application/{service,application,application-status,customer-steps,correction}.ts`, `src/core/domain/payment/pricing.ts`, `src/core/ports/registration/registration-gateway.ts` + contract, `src/core/ports/repository/application-repository.ts` + contract, `src/core/ports/payment/payment-provider.ts`, `src/core/use-cases/checkout/submit-checkout.ts`, `src/core/use-cases/status/get-status-by-token.ts`, `src/adapters/registration/{zulex,fake}/`, `src/adapters/payment/stripe/stripe-payment-provider.ts`, `src/adapters/mail/resend/copy.ts`, `app/_components/service-selection.tsx`, `app/status/[token]/`, `eslint.config.mjs`, `db/migrations/0008_add_application_service/`, `db/seed/` — N1
- `src/core/domain/application/{new-registration-request,new-registration-correction}.ts`, `src/core/domain/vehicle/{evb-number,registration-certificate-part2,engine-type}.ts`, `src/core/domain/customer/{owner,postal-address,bank-account}.ts`, `src/core/domain/registration/rejection-catalogue.ts`, `docs/domain-glossary.md` — N2
- `db/migrations/0010_add_new_registration_details/`, `src/adapters/repository/{postgres,fake}/`, `db/seed/data/` — N3
- `src/adapters/registration/zulex/{zulex-registration-gateway,schemas}.ts`, `tests/msw/zulex.ts`, `tests/fixtures/zulex.ts`, `docs/registration-user-journeys.md` — N4
- `src/core/use-cases/payment/confirm-payment.ts`, a verification use case under `src/core/use-cases/identity/`, `src/adapters/identity/verimi/`, `src/config/{env,container}.ts`, `app/api/webhooks/` — N5
- `app/(funnel)/register/`, `app/(funnel)/_components/stripe/`, `docs/site-contract.md` — N6
- `app/status/[token]/_components/`, `src/adapters/mail/resend/` snapshots, `tests/integration/new-registration-*.test.ts` — N7
- Legal pages, retention job, `docs/runbooks/` — N8, N9

## Verification

As launch-plan.md § Verification: each exit criterion is a test, a CI job or an observed staging or production run, never a claim. At every milestone, lint, typecheck, tests and the build with the secret canary run green in CI, and `client-bundle-secrets.test.ts` plus the secrets-absent tests pass, extended in N2–N4 to every Neuzulassung secret. Final verification is N9's beta: real registrations observed in production before the gate opens.
