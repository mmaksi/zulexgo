# ZulexGO — Wiederzulassung (re-registration) launch plan

## Context

The third service after de-registration and Neuzulassung: **Wiederzulassung**, putting a de-registered car back on the road. The Zulex API calls it *reactivation*: `POST /reactivation-applications`, `GET` and `PATCH /reactivation-applications/{id}`, plus the shared `POST /applications/{id}/retry`, `GET /documents/{id}` and `GET /registration-authorities`. Price on the founder's list: 99 € (`SERVICE_PRICES.reRegistration` in `src/core/domain/payment/pricing.ts`).

**How this plan relates to the others.** [launch-plan.md](launch-plan.md) stays the source of truth for every rule the services share: the status machine, the error algorithm, payment, capture, refunds, emails, polling, idempotency, legal baseline. [registration-plan.md](registration-plan.md) built the parts a service that files in the keeper's name needs (identity verification, owner data, the bank account for vehicle tax, consent with a power of attorney, the per-stage sale and beta settings). This plan owns only what is specific to Wiederzulassung. Its open questions are numbered **Q57–Q67** and live in launch-plan.md with the others; its milestones are **W0–W10**, so they never collide with M0–M9 or N0–N10. No sizing or dates: ordering and exit criteria only.

**What already exists for Wiederzulassung:** the service key `reRegistration` in `SERVICES` (`src/core/domain/application/service.ts`), its price, the value in the database's service check (migration `0008`), and a landing card that reads "Bald verfügbar". Nothing can order it: it has no request type and no entry in `REQUEST_PARSERS`, no funnel and no Zulex call, and migration `0010`'s check `applications_service_columns` refuses its rows (`ELSE false`, pinned by `postgres-application-repository.test.ts`).

**What already works for every service** (no change needed): the status machine with the verified path 1 → 2 → 3 → 4 for a service outside `DIRECT_SERVICES`, the error algorithm and its one silent retry, refunds, the hold policy, polling, `retry`, document fetching and storage, status tokens and the resend-link flow, identity verification on the fake adapter (`confirmPayment` → `startIdentityVerification` → `checkIdentityVerification`), stored consent (D9), `SERVICES_ON_SALE` and the beta settings, the report endpoint (it iterates `ORDERABLE_SERVICES`), and the shared funnel parts in `app/(funnel)/_components/` (`FunnelFrame`, `CheckoutPanel`, `Choice`, the Stripe Payment Element).

**What would silently treat a third service as one of the first two.** Most per-service code is a `Record<OrderableService, …>` or a `switch`, so the compiler lists it once `reRegistration` joins `ServiceRequest`. These places compare against one service and fall through to the other, so they would compile and misbehave (W1 closes them):
- `withoutAccount` in `application.ts`: the bank account would never be erased.
- `ownerOn` in `check-identity-verification.ts`: throws at runtime.
- `hasOpenApplication` in the Postgres repository and `isTheVehicle` in the in-memory one: the duplicate check.
- The summary in `get-status-by-token.ts` and `corrector` in `correct-application.ts`.
- Seven comparisons in `app/status/[token]/_components/status-view.tsx` (deadline, completed copy, owner correction, summary, document labels, next steps, heading).
- The seed's request builder and poll schedule in `db/seed/data/applications.ts`.
- `secretsOf` in `tests/fixtures/secrets.ts` and `customerVerifies` in `tests/integration/flow-harness.ts`.
- The Neuzulassung review step hard-codes `SERVICE_PRICES.newRegistration`.

---

## Status (2026-10-07)

Nothing is built. Wiederzulassung is not on sale on any stage; `/reregister` does not exist.

| Milestone | State | Pull requests | What was built, and where it differs from the text below |
|---|---|---|---|
| W0–W10 | Not started | none | — |

---

## Scope at launch

Plan defaults, each tied to an open question so the founder can widen or narrow it. Every default is provisional, not approved by the founder.

| In | Out (for now) |
|---|---|
| Cars (`vehicleType: CAR`, `vehicleUsage: NORMAL`) | Motorcycles, 125s, quads, trailers, trucks, taxi, rental (Q57) |
| Private persons aged 18 or over, living in Germany, who will be the keeper | Legal entities, the `PERMANENT_POA` and `KBA` owner sources (Q57, PRD) |
| All four change types: the keeper in Teil I or a new keeper (a buyer), in the same district or after a move; derived from the customer's answers, never typed (Q57) | — |
| Keeping the old number (`isLicencePlateTransfer: true`) or a new one assigned by the authority, as the customer chooses (Q59) | Wish plate with a reservation PIN (Q51) |
| E-plate for an electric car, seasonal plate | H-plate |
| A Teil I with its security code, the old plate's seal codes, the Teil II (Q60, Q66) | Cars outside the eligibility the first step asks about: de-registered too long ago, an expired HU, papers without codes (Q60) |
| Identity verification before filing (statuses 2 and 3, Q58) | Launch without it |
| Documents shipped by the authority to the keeper (`SHIPPING`) | Pick-up, a different address for Teil II (Q63) |
| Card payment, Apple Pay, Google Pay (Q12) | Plates, seals and shipping sold by us; an offer from a completed de-registration (Q63, Q65 → W10) |

## What the customer must provide

Every field is in the API's create request (`CreateReactivationApplicationRequest`). "Secret" means encrypted at rest, never in logs, emails, status pages, URLs or committed fixtures.

| Field | API path | Constraint | Secret |
|---|---|---|---|
| Old plate | `licencePlateInfo.currentLicencePlate` | `licencePlateSchema`, as de-registration's | no |
| Plate count | none (decides whether the front code is asked) | 1 or 2, as de-registration's | no |
| Rear seal code | `licencePlateInfo.currentLicencePlateSecurityCodes.rearPlateSecurityCode` | 3 characters; the spec has no pattern, we take de-registration's `SecurityCode` `rearPlate` | yes |
| Front seal code | `…frontPlateSecurityCode` | 3 characters, two-plate cars only (`SecurityCode` `frontPlate`) | yes |
| Teil I number | `registrationCertificateInfo.registrationCertificatePart1Number` | 18–20 characters in the spec; what the customer reads off the document, and where, to confirm (Q66) | no |
| Teil I security code | `registrationCertificateInfo.registrationCertificatePart1SecurityCode` | 7 characters (`SecurityCode` `certificate`) | yes |
| Teil II number | `registrationCertificateInfo.registrationCertificatePart2Number` | 1–20 characters | no |
| Teil II security code | `registrationCertificateInfo.registrationCertificatePart2SecurityCode` | optional in the spec (required for Neuzulassung and Ummeldung); asked when the keeper changes (Q66) | yes |
| VIN | `vehicleInfo.vin` | `[A-Z0-9]{1,17}` in the API; we require 17, as Neuzulassung does, because `PATCH` cannot change it | no |
| Engine type | `vehicleInfo.engineType` | `ELECTRICAL`, `HYBRID`, `COMBUSTION` | no |
| Vehicle type, usage | `vehicleInfo.vehicleType`, `vehicleUsage` | fixed `CAR`, `NORMAL` at launch | no |
| eVB number | `evbNumber` | `evbNumberSchema` (the spec's pattern, anchored) | yes |
| Is the customer the keeper in Teil I? | becomes `licencePlateInfo.changeType` | yes / no | no |
| Has the keeper moved to another district? | becomes `licencePlateInfo.changeType` | derived from the authorities' `kreiscode`s; asked only when that is ambiguous | no |
| Keep the old number? | `isLicencePlateTransfer` | an explicit choice, nothing preselected | no |
| Plate options | `licencePlateInfo.licencePlateAttributes` | electric only for `ELECTRICAL`; seasonal months 1–12; historic always `false` (`plateOptionsSchema`) | no |
| Keeper: names, gender, birth date and place, phone, email, address | `ownerInfo.personalInfo` (`source: REQUEST_FOR_INDIVIDUAL_PERSON`) | `ownerSchema(now)`, `postalAddressSchema`, as Neuzulassung's | yes (birth date, birth place, phone, address) |
| Delivery | `ownerInfo.deliveryInfo` | `SHIPPING` to the keeper's name and address | — |
| Bank account for vehicle tax | `ownerInfo.sepaInfo` | `bankAccountSchema` (German IBAN); erased when the order ends | yes |

The keeper's postcode picks the authority (`GET /registration-authorities?postcode=…`), as for Neuzulassung; the old plate's prefix names the authority that issued it. Comparing the two gives the district half of the change type.

## The order's life

`awaiting_payment` → **1** paid → **2** waiting for identity verification → **3** identity verified → **4** filed with Zulex, KBA processing → **5a** | **5b** | **5c**, plus `cancelled`.

- The path is Neuzulassung's: `reRegistration` stays out of `DIRECT_SERVICES`, so `confirmPayment` starts the verification and **Zulex is called only at 3 → 4** (Q58).
- Emails: 1, 2, 3, 4, 5a, 5b, 5c, 6, plus the verification reminder (Q48 reused).
- Failure classes (Q61, provisional). Zulex's `PATCH` can change only the eVB, the Teil I number and code, the Teil II number and code, and a wish plate:
  - wrong eVB, Teil I or Teil II data → **5b**, corrected on the status page;
  - the kept number is no longer available → **5b**. If Zulex refused it at submission (no application id), the correction is "a new number instead", filed afresh under a new key (Q37's path). If it was refused after filing, `PATCH` cannot change `isLicencePlateTransfer`, so the customer can only cancel until Q67 says a fresh application may follow a rejected one;
  - wrong keeper data, address, VIN, old plate, seal codes or change type → cannot be corrected once filed; the unknown code goes to 5b, whose form offers only the fields above, so the customer cancels and the fee is kept;
  - identity verification failed → **5c** (99 € − 19.99 € = 79.01 € back); the verified person is not the keeper on the order → **5b**, name and birth date correctable at no cost (Q47 reused).
- A card is held at checkout and captured as launch-plan Q7 and Q20 say; the verification deadline ends inside the hold (Q48 reused).

---

## Default technical decisions (overridable; none blocks a milestone)

| Decision | Default | Why |
|---|---|---|
| Service key | `reRegistration` in every layer, also the Stripe `service_type` and `INVITE_CODES_RE_REGISTRATION`; "reactivation" appears only inside the Zulex adapter | The key is already in `SERVICES`, `SERVICE_PRICES`, the database check and the landing card |
| Route | `app/(funnel)/reregister/`, confirmation at `/reregister/bestaetigung` | Mirrors `/deregister` and `/register` |
| Order shape | `ReRegistrationRequest` (checkout) and `StoredReRegistrationRequest` (bank account optional once the order has ended) join `ServiceRequest`; the parser joins `REQUEST_PARSERS` | The compiler lists every exhaustive site once W1 has made them all exhaustive |
| Change type | Never typed by the customer: `changeTypeOf({ keeperChanges, districtChanges })` maps the two answers to `NO_CHANGE`, `OWNER_CHANGE`, `DISTRICT_CHANGE` or `OWNER_AND_DISTRICT_CHANGE`, decided at checkout and stored on the order | `PATCH` cannot change it, so a wrong one could never be corrected |
| District | `districtOf(prefixAuthorities, postcodeAuthorities)` compares `kreiscode`s: one and the same authority on both sides → same district; no authority in common → moved; anything else → the funnel asks | A prefix can span several authorities ("M" is both the city and the Landkreis München) |
| Storing the order | Plate and VIN in plain columns, as de-registration's (not secrets; the duplicate check reads them); every code, the eVB, the keeper's data and the bank account in `encrypted_details`, the order reference as associated data, through a codec beside `new-registration-details.ts` | The scheme of migrations `0001` and `0010` |
| Duplicates | A second open Wiederzulassung for the same VIN: the warning de-registration and Neuzulassung give (J8, Q38). One of our de-registrations still open for the VIN: **refused** | Filing a reactivation before the de-registration completes would fail |
| Identity verification | Not in `DIRECT_SERVICES`; production refuses the fake identity adapter while the service is on sale (`fakeIdentityProblem`) | Registers a car in a person's name and sets up a direct debit (Q58) |
| Shared funnel steps | The keeper, vehicle-tax and plate-option fields move from `app/(funnel)/register/_components/` to `app/(funnel)/_components/`; `/register` behaves exactly as before | Same fields, same validation, two funnels |
| Consent | The three checkboxes of a Neuzulassung (AGB with the withdrawal notice, the early-start waiver, a power of attorney carrying the vehicle-tax mandate), with their own text versions | Filed in the keeper's name (Q64) |
| Wish plate | Not offered | Q51 |

---

## Critical path

```
W0 Questions out, beta cars lined up (no code) ────────────────────────────────┐
W1 Every per-service branch exhaustive (refactor; both services as before)     │
 → W2 Wiederzulassung domain rules                                             │
    → W3 Persistence ──────┐                                                   │
    → W4 Zulex adapter ────┼→ W5 Checkout and filing → W7 After filing          │
    → W6 Funnel /reregister (on fakes, parallel to W3–W5)                      │
 → W8 Legal, privacy, security ←───────────────────────────────────────────────┘
 → W9 Staging run → beta → on sale   (needs launch-plan M8, the Zulex API, a real identity adapter)
   W10 After launch: the offer from a de-registration, plates and seals (Q63, Q65)
```

W1 to W8 need neither the Zulex API nor the founder; they run on the fakes and the msw doubles. Wiederzulassung goes on sale only after de-registration is public (M9), and, like Neuzulassung, only with a real identity adapter.

---

## Milestones

### W0 — Questions out, lead-time items started

**Goal:** Every answer and external dependency Wiederzulassung needs is asked for before code depends on it.

**How (no code):**
- Q57–Q67 are in launch-plan.md (added with this plan). Send Q57–Q63 and Q65 to the founder, Q64 to the lawyer, Q66 and Q67 to the Zulex API team, together with Q56.
- Lawyer: the AGB section, the power of attorney and vehicle-tax mandate for Wiederzulassung, the privacy-policy additions (Q64). They join Neuzulassung's deferred N8 texts.
- Beta cars, de-registered and ready to come back: one whose keeper keeps the number, one bought by a new keeper who takes a new number, one whose keeper moved and keeps the number, one electric car with an E-plate; at least one online and one manual-processing authority. A real beta cannot be simulated.

**Exit criteria:** questions logged and sent, each with someone chasing it; Zulex has confirmed whether reactivation for private persons is enabled on our account and in the integration environment, or the "no" is recorded as a blocker.

**Tests:** none — no code.

---

### W1 — Every per-service branch exhaustive

**Goal:** Adding a service fails the build at every place that treats services differently. De-registration and Neuzulassung behave exactly as before.

**Why first:** the places listed in Context compile with a third service and quietly give it another service's behaviour; one of them keeps an IBAN forever. Closing them behind the full existing suite is cheaper than finding them by a failing order.

**How:** each comparison becomes a `Record<OrderableService, …>` or a `switch` ending in a `never` check:
- `withoutAccount` in `application.ts`: a per-service table of what an ended order drops.
- `ownerOn` in `check-identity-verification.ts`, `hasOpenApplication` in the Postgres repository, `isTheVehicle` in the in-memory one, the summary in `get-status-by-token.ts`, `corrector` in `correct-application.ts`.
- `status-view.tsx`: the summary, deadline, completed copy, owner correction, document labels, next steps and heading become per-service tables.
- The seed's request builder and poll schedule, `secretsOf`, `customerVerifies`.
- The Neuzulassung review step takes its price from its service instead of naming `newRegistration`.

**Tested:** by the existing suites; no new behaviour.

**Exit criteria:** full suite and migration rehearsal green with **no changed assertion**; email snapshots byte-identical; the pull request shows that a throwaway extra member of `ServiceRequest` makes `tsc` name every site above.

---

### W2 — Wiederzulassung domain rules

**Goal:** Every rule the API and the business logic set for Wiederzulassung exists as pure, tested code, before any adapter or screen uses it.

**How (test-first):**
- `src/core/domain/application/re-registration-request.ts` (zod, shared with the browser as the other two are), composed of existing value objects: `vinSchema` (17 characters), `licencePlateSchema`, `SecurityCode` (`rearPlate`, `frontPlate`, `certificate`), `evbNumberSchema`, `engineTypeSchema`, `plateOptionsSchema`, `ownerSchema(now)`, `postalAddressSchema`, `bankAccountSchema`. New:
  - `src/core/domain/vehicle/registration-certificate-part1.ts`: the Teil I number (18–20 characters until Q66 says its format) and its security code;
  - the Teil II with its code required when the keeper changes (Q66);
  - `keeperChanges: boolean` and `plateChoice: "keep" | "new"`.
- `src/core/domain/registration/change-type.ts`: `changeTypeOf` and `districtOf` (`same | moved | unknown`), pure.
- `src/core/domain/application/re-registration-correction.ts`, its own module because the client form imports it (as `new-registration-correction.ts`): the eVB, the Teil I number and code, the Teil II number and code; name and birth date only while the order was never verified (Q47); "a new number instead" only for an order Zulex refused at submission (Q59, Q61).
- `REQUIRED.reRegistration` in `consent.ts`: AGB, early start, power of attorney (Q64).
- The eligibility questions of the funnel's first step as data, each with its reason and the offline alternative (Q60).
- `docs/domain-glossary.md`: facts only.

**Tested:** every validation boundary (the Teil I number at 17, 18, 20 and 21 characters, the 7- and 3-character codes, the front code only with two plates, the Teil II code required exactly when the keeper changes, E-plate only for electric, the 18th birthday with a frozen clock); all four rows of `changeTypeOf`; `districtOf` with one shared authority, disjoint sets, and a prefix with two authorities of which one is the postcode's (`unknown`); no secret in `JSON.stringify` or `String()` output.

**Exit criteria:** the above green; `parseReRegistrationRequest` accepts the spec's example shape and rejects each broken field with its own path.

---

### W3 — Persistence

**Goal:** A Wiederzulassung order survives between checkout, verification, filing and every poll, with its codes and personal data encrypted.

**How:**
- Migration `0013_add_re_registration`: `applications_service_columns` gains `reRegistration` (plate columns and VIN filled, `encrypted_details` filled, `encrypted_security_codes` empty); `applications_consent_complete` requires the power of attorney for it too. `down.sql` deletes Wiederzulassung orders (the dev-only runner, as `0010`'s does) and restores both checks; `README.md`.
- A details codec beside `new-registration-details.ts`; the Postgres adapter's `requestColumns` and `toRequest`, and the in-memory adapter, gain the service.
- The repository contract gains a Wiederzulassung case per status, a correction, a raw-row test that finds no code, IBAN, birth date or eVB in plain text, and the cross-service rule (an open de-registration for the same VIN).
- Seed: one Wiederzulassung order per status (`ZG-SEED21` to `ZG-SEED29`) with obviously fake data; the coverage test iterates service × status.

**Exit criteria:** migration rehearsal green (up → down all → up); both adapters pass the same contract; seed coverage per service green; loading the seed with `APP_ENV=production` still throws.

---

### W4 — Zulex adapter for reactivation

**Goal:** A Wiederzulassung order can be filed, checked, corrected and its documents fetched through the Zulex adapter, proven against the spec at the network boundary.

**How:**
- `src/adapters/registration/zulex/`: `APPLICATION_PATHS.reRegistration` is `/reactivation-applications`. The create body: `ownerInfo` (individual person, `deliveryInfo` `SHIPPING`, `sepaInfo`), `licencePlateInfo` (`changeType`, `currentLicencePlate`, `currentLicencePlateSecurityCodes`, `licencePlateAttributes` with `historicLicencePlate: false`), `isLicencePlateTransfer` from the plate choice, `registrationCertificateInfo`, `vehicleInfo` (`CAR`, `NORMAL`), `evbNumber`; always with `X-Idempotency-Key`. `PATCH` with the changed fields only, never empty. Document kinds as Neuzulassung's until Q67 says which document confirms a reactivation.
- The fake gateway records reactivations; msw routes for reactivation in `tests/msw/zulex.ts`; strict zod copies of the spec's create and patch bodies in `tests/fixtures/zulex.ts`, so `ZulexDouble` answers 400 to a body the spec refuses.
- **Spike**, as soon as the API is back (read-only, throwaway): file with the number kept and with a new one; an owner change and a district change; a number no longer available; a Teil I code already uncovered by an online de-registration; which documents arrive and where the plate appears. Scrubbed fixtures into `tests/fixtures/zulex/`; findings into a new `docs/re-registration-user-journeys.md`, with these journeys:
  - **WJ1** the keeper keeps the number; **WJ2** a buyer takes a new number; **WJ3** a keeper who moved takes the number along;
  - **WJ4** the kept number is no longer available; **WJ5** the seals were removed at an office de-registration; **WJ6** one of our de-registrations of the car is still open;
  - **WJ7** the buyer typed the seller's name (identity mismatch); **WJ8** the HU has expired; **WJ9** the authority is offline; **WJ10** a wrong Teil I code, corrected.

**Tested:** the gateway contract for the reactivation path via msw; the create body matches the spec's schema field by field; a response body that echoes codes and the IBAN never reaches a log (the logs secrets test extended to every W2 secret).

**Exit criteria:** contract green on fake and Zulex adapter; spike done, or recorded as blocked by the API.

---

### W5 — Checkout and filing

**Goal:** On the fakes, a Wiederzulassung order is taken, verified, filed and ended along every path, with exactly one email per step.

**How:**
- `submitCheckout`: the authority by the keeper's postcode (`authorityOf`); `districtOf` against the lookup by the old plate's prefix, then `changeTypeOf`, stored on the order; the cross-service refusal; consents, invite and beta place as for the other services.
- `ownerOn` returns the keeper on the order (the buyer, after an owner change); the W1 table drops the bank account when the order ends.
- `INVITE_CODES_RE_REGISTRATION` in `src/config/env.ts` and `.env.example`; `RATE_LIMITS` keys for the funnel's lookup and checkout.

**Tested:** `tests/integration/re-registration-checkout.test.ts` and `re-registration-flow.test.ts`: 1 → 2 → 3 → 4 → 5a; a mismatch to 5b, corrected and filed; an expired verification cancelled with the hold released in full; nothing reaches Zulex before status 3; the checkout refused while the service is not on sale and while one of our de-registrations of the VIN is open; the stored change type for each of the four combinations; no bank account after 5a, 5c or `cancelled`.

**Exit criteria:** the above green.

---

### W6 — Funnel `/reregister`

**Goal:** A customer on a phone can enter everything Wiederzulassung needs, choose to keep the number or not, see the full price and the fee notice, consent and pay.

**How:** the shared keeper, vehicle-tax and plate-option fields move to `app/(funnel)/_components/` first, with `/register` unchanged. Then one decision per screen, as the site contract asks:
1. **Voraussetzungen:** the car is de-registered; within the limits Q60 sets (how long ago, a valid HU, a Teil I with a security code); the old plate's seal codes can be read; Teil II and an eVB at hand; the keeper is 18 or over and lives in Germany; a bank account for vehicle tax; postcode → authority availability notice. A "no" stops with the reason and the offline alternative.
2. **Altes Kennzeichen & Fahrzeug:** old plate, plate count, seal codes, VIN, engine type, each code with a locator image.
3. **Papiere:** Teil I number and code, Teil II number (and code when the keeper changes), eVB number.
4. **Halter:** "Sind Sie der Halter, der in Teil I steht?", then name, gender, birth date and place, address, phone, email; a district question only when `districtOf` cannot tell.
5. **Kennzeichen:** keep the old number or take a new one, each with what it means for the plates and what happens if the number is no longer free; E-plate offered only for electric cars; seasonal months.
6. **Kfz-Steuer:** the shared step.
7. **Prüfen & bezahlen:** masked summary, 99 €, the 19.99 € fee notice, the three consents, the Payment Element.
8. **Bestätigung:** reference, "link on its way", and that an identity-verification email follows.

`docs/site-contract.md` gains a Wiederzulassung funnel section with field limits.

**Tested:** per-step validation; contextual fields (front code only with two plates, Teil II code only when the keeper changes, the district question only when unknown, E-plate only for electric); the plate choice required; back and forward keep the data; "Jetzt bezahlen" disabled until every consent is ticked; fee notice present before payment is possible; every input has an accessible name; the page is not found while the service is not on sale (`page.test.ts`); rate limits (`requests.test.ts`); forms do not submit natively before hydration. **Not tested:** copy, progress indicator, locator images.

**Exit criteria:** the above green; checked in the browser on phone, tablet and desktop widths with the fake payment.

---

### W7 — After filing: status page, emails, documents, correct and cancel

**Goal:** A Wiederzulassung customer follows every step, downloads the documents at 5a, and can correct or cancel at 5b.

**How:**
- Status page: summary (old plate, VIN ending, kept or new number); the five-row stepper; 5a with the documents and what arrives by post and what the customer does next (Q63); 5b with our reason, the correction form (`correct-re-registration.tsx`: eVB, Teil I, Teil II; name and birth date after a mismatch; "a new number instead" only on a refile) and cancel with the fee; 5c and cancelled with the refund.
- `correctApplication` dispatches the service: `PATCH /reactivation-applications/{id}`, or filed afresh after a refusal at submission (Q37).
- Copy for emails 1, 4, 5a, 5b, 5c in `copy.ts`, each a reviewed snapshot; what follows 5a as one shared wording for the page and email 5a, beside `NEW_REGISTRATION_NEXT_STEPS`, claiming nothing the founder has not confirmed (Q63).

**Tested:** a correction becomes the right `PATCH` body at the network (msw); a refile with a new number sends `isLicencePlateTransfer: false` under a new key; rendered status HTML contains no code, IBAN, birth date, eVB or address (`secretsOf` extended); documents download only behind the token.

**Exit criteria:** the above green; `/status/seed-status-link-*` shows every Wiederzulassung status on staging.

---

### W8 — Legal, privacy and security for Wiederzulassung

**Goal:** Wiederzulassung may lawfully be sold, and the seal and Teil I codes it holds add no risk.

**How:**
- Lawyer-reviewed texts in place: AGB section, power of attorney, vehicle-tax mandate wording, privacy policy (Q64); deferred with Neuzulassung's, so placeholders stay and the service stays off sale until then.
- Threat-model rows: re-registering someone else's de-registered car with stolen papers; a buyer holding a seller's papers; a stranger's IBAN; a leaked status link; codes at rest; `/security-review` of the branch.
- Price display (PAngV) for 99 € (Q62).

**Exit criteria:** no placeholder legal text on the Wiederzulassung path; consent including the power of attorney stored per order (test); log-redaction test covers every W2 secret.

---

### W9 — Staging run, beta, on sale

**Goal:** Real Wiederzulassungen by a known group succeed in production before the service is offered to everyone.

**Needs:** launch-plan M8 (production, monitoring, the poller's cron), the Zulex API with reactivation enabled, a real identity adapter, W0–W8 exit criteria met.

**How:**
- Staging: one run against the integration environment to status 4, and to 5a if that environment finishes applications.
- Beta: `reRegistration` in `SERVICES_ON_SALE` and `BETA_SERVICES` with invite codes, on the cars lined up in W0; `docs/runbooks/re-registration-beta.md`.
- Remove it from `BETA_SERVICES` for the public launch; `service-selection.test.tsx` counts the services sold.

**Exit criteria:** every beta order's status matched Zulex's at every check; each 5a's documents downloaded from production; a kept number and a new number both seen through; one deliberate 5b corrected and resubmitted; zero personal-data findings in logs, emails or status pages; then the gate opens.

---

### W10 — After launch

**Goal:** The follow-ups that wait for the founder: a Wiederzulassung offered from a completed de-registration with the plate and VIN taken from our own order, a reminder only with the customer's marketing consent (Q65), and seals, plates and shipping together with Neuzulassung's N10 (Q41, Q50, Q63).

---

## Blocked items and the fallback if unresolved

| Item | Lands in | Fallback |
|---|---|---|
| Zulex API down, or reactivation not enabled (Q67) | W4, W9 | Adapter proven against the spec via msw; no staging run and no beta until it is up |
| Codes already uncovered by an online de-registration, or seals removed at an office (Q66) | W2, W6 | The first funnel step stops those customers with the reason and the offline alternative |
| Whether a kept number is still free cannot be known before filing (Q59, Q67) | W6, W7 | A warning in the plate step; a refusal at submission is refiled with a new number, a refusal after filing can only be cancelled |
| Identity provider (Q1–Q3, Q58) | W5, W9 | Built and tested on the fake; production refuses the fake, so the service stays off sale |
| Zulex error codes for reactivation (Q61, Q67) | W2, W7 | Unknown code → one silent retry → 5b, as launch-plan Q10 |
| Lawyer texts (Q64) | W6, W8 | Placeholders in dev and staging; the service stays off sale |
| Beta cars (W0) | W9 | None: the gate does not open without real reactivations |

## Reactivation API findings to flag

From `docs/api-1.yaml`; confirm or correct in the W4 spike.

1. **`isLicencePlateTransfer` is required and has no description.** We read it as "keep the current number"; whether that is allowed with an owner change or a move, and how a number no longer free is reported, is not said.
2. **`currentLicencePlate` and its seal codes are required** even when the customer takes a new number, and even when the seals were removed at an office de-registration; an online de-registration has already uncovered them.
3. **The Teil I security code is required**, though an online de-registration uncovers it; whether an uncovered code is accepted again is not said.
4. **`changeType` has no description, no validation rule and cannot be patched**, and the request has no field for the authority: what decides the district is implicit.
5. **The Teil I number is 18–20 characters** with no pattern and no description of what is printed on the document.
6. **The Teil II security code is optional here**, required for Neuzulassung and Ummeldung; its `maxLength` is 2147483647.
7. **No reactivation document type.** `REGISTRATION_CONFIRMATION` and `TEMPORARY_REGISTRATION_CERTIFICATE` exist; which arrives for a reactivation is not said.
8. **`PATCH` cannot change the plate, its codes, the owner, the change type or `isLicencePlateTransfer`**, so any error there is final after filing.
9. **No HU, no previous de-registration, no time limit**: the request carries nothing the KBA checks eligibility against, so only a refusal tells.
10. **The response echoes every code, the eVB and the IBAN in plain text**, and does not carry the assigned or kept plate. Never log a response body.
11. **The same gaps as the other services:** three statuses, no timestamps, no webhook, no error body schema, an unanchored eVB pattern, codes without a pattern (`docs/deregistration-user-journeys.md` § API & business problems).

## Risks

- **Uncovered codes.** If the KBA does not accept a Teil I code and seal codes already uncovered by an online de-registration, our own de-registration customers cannot use this service. Mitigation: Q66 asked first, the spike before W6's copy is final, and the first step stops them rather than taking their money.
- **A kept number that is gone.** A refusal after filing cannot be patched, so the customer cancels and pays the fee. Mitigation: the warning in the plate step, Q67, and the refile with a new number when the refusal comes at submission.
- **Papers in the wrong hands.** A buyer holds the seller's Teil I and Teil II; a thief could too. Mitigation: the identity check binds the person filing; the Teil I code, the seal codes and, for an owner change, the Teil II code prove possession. Residual: a thief who verifies, as with Neuzulassung's Teil II (`docs/threat-model.md`).
- **A wrong change type.** It cannot be corrected after filing. Mitigation: derived from the authorities and one question, never typed; whether Zulex validates it is Q67.
- **W1 changes code both other services run on.** Mitigation: no changed assertion, byte-identical snapshots, a staging deploy before merge to `main`.
- **Personal data and drop-off.** As Neuzulassung's: eight funnel screens plus a verification after payment, more codes held. Encryption at rest, the IBAN erased at the end, the redaction tests; drop-off watched in W9 through the report endpoint.
- **The beta needs real de-registered cars** in several variants. Lined up in W0, or the gate waits.

## Critical files

- `src/core/domain/application/application.ts`, `src/core/use-cases/identity/check-identity-verification.ts`, `src/core/use-cases/application/correct-application.ts`, `src/core/use-cases/status/get-status-by-token.ts`, `src/adapters/repository/{postgres,fake}/`, `app/status/[token]/_components/status-view.tsx`, `app/(funnel)/register/_components/review-step.tsx`, `db/seed/data/applications.ts`, `tests/fixtures/secrets.ts`, `tests/integration/flow-harness.ts` — W1
- `src/core/domain/application/{service,consent,re-registration-request,re-registration-correction}.ts`, `src/core/domain/vehicle/registration-certificate-part1.ts`, `src/core/domain/registration/change-type.ts`, `docs/domain-glossary.md` — W2
- `db/migrations/0013_add_re_registration/`, `src/adapters/repository/{postgres,fake}/`, `db/seed/` — W3
- `src/adapters/registration/zulex/{zulex-registration-gateway,request-bodies}.ts`, `src/adapters/registration/fake/`, `tests/msw/zulex.ts`, `tests/fixtures/zulex.ts`, `docs/re-registration-user-journeys.md` — W4
- `src/core/use-cases/checkout/submit-checkout.ts`, `src/config/env.ts`, `src/core/domain/rate-limit/rate-limits.ts`, `tests/integration/re-registration-*.test.ts` — W5
- `app/(funnel)/reregister/`, `app/(funnel)/_components/`, `app/_components/funnels.ts`, `docs/site-contract.md` — W6
- `app/status/[token]/_components/`, `src/adapters/mail/resend/copy.ts` and its snapshots, `src/core/domain/registration/` (what follows 5a) — W7
- `docs/threat-model.md`, legal pages — W8; `docs/runbooks/re-registration-beta.md` — W9

## Verification

As launch-plan.md § Verification: each exit criterion is a test, a CI job or an observed staging or production run, never a claim. At every milestone, lint, typecheck, tests and the build with the secret canary run green in CI, and `client-bundle-secrets.test.ts` plus the secrets-absent tests pass, extended in W2–W4 to every Wiederzulassung secret. Final verification is W9's beta: real reactivations observed in production before the gate opens.
