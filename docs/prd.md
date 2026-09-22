# ZulexGO B2C — Product Requirements Document (MVP: Vehicle De-registration)

## 1. Vision
Let any private vehicle owner in Germany de-register their vehicle (Außerbetriebsetzung) fully online in under 10 minutes — no Zulassungsstelle appointment, no account, no paperwork mailed. ZulexGO wraps the existing B2B Zulex API in a guided, trustworthy consumer flow: check eligibility, enter the codes from your documents and plates, pay, and follow every step of your application to the official KBA confirmation.

## 2. User Personas
- **Private seller ("Sabine, 42")** — sold or scrapped her car, needs the official deregistration confirmation quickly so insurance and tax stop. Non-technical; needs plain-language guidance on where the security codes are.
- **Motorcycle/seasonal owner ("Timo, 29")** — de-registers his motorcycle each winter. Price-sensitive, mobile-first, wants it done in one sitting; only one plate.
- **Helper for a relative ("Jonas, 35")** — handles the process for a parent using the parent's physical documents. Needs a shareable status link and clear statement of who the applicant is.

Out of scope for MVP: fleet managers, dealers (served by B2B), legal entities.

## 3. Feature List
**Must-Have**
- Guided service selection (de-registration only; other services shown as "coming soon")
- Early eligibility check: German plate, documents & plate seals with intact security codes, one-vs-two plates, authority availability via `/registration-authorities` (sets processing-time expectation)
- Contextual form: front-plate code shown only for two-plate vehicles; `reserveLicencePlate` never shown (removed from MVP)
- Full client-side validation matching API patterns before payment
- Online payment via Stripe with pre-authorization (capture on successful submission/confirmation, release on failure) and full price display incl. authority fees
- Order confirmation with reference number + confirmation email
- Account-free status dashboard via unguessable one-time link; 7-step status journey; email on every status change
- Correction flow for rejected applications via PATCH (no extra charge)
- Clear end states: success (with downloadable official confirmation PDF), rejected-correctable, rejected-final (with refund policy)
- Legal baseline: Impressum, AGB, privacy policy, withdrawal-right waiver consent at checkout

**Should-Have**
- "Resend my status link" recovery by email + reference number
- Automatic retry of `ERROR`-status applications with quiet UX
- Duplicate-application warning (same plate + VIN with open application)
- German + English UI (German primary)

**Nice-to-Have**
- Plate/VIN scan via camera (OCR)
- SMS status notifications
- Post-completion cross-sell (reactivation reminder for seasonal vehicles)

## 4. Technical Constraints
- Next.js app; all Zulex API calls server-side only — the `X-Api-Key` is a merchant credential and must never reach the browser (BFF pattern).
- Zulex API exposes only `IN_PROGRESS | FINISHED | ERROR` and no timestamps or webhooks for applications → our backend owns the customer status machine (steps 1–3 are internal; 4–7 mapped from API + documents + `errorInfo`) and polls with backoff, honouring `Retry-After`.
- Always send `X-Idempotency-Key`; error bodies are unspecified, so all user-facing error copy is ours; be resilient to unknown status/alert tags and `UNKNOWN` document types.
- The application is submitted to the Zulex API (and by it to the KBA) immediately at checkout. The de-registration request carries no owner identity or email; under i-Kfz the scratched security codes are the proof of possession, so there is no separate identity-verification step to run or observe. Founder's status steps 2–3 ("waiting for / completed identity verification") therefore have no event behind them — default is a 5-step journey; keeping them as static explanatory text is a copy decision, not a tracked state.
- Stripe: PaymentIntent with `capture_method: manual` (pre-auth); auth hold validity ~7 days — capture strategy must account for manual-processing authorities (`ikfzStatus` ≠ online).
- Security codes are secrets: never rendered on the status page, never logged, never emailed; status-link tokens ≥128 bits entropy, rate-limited, revocable.
- GDPR: data minimization, encryption at rest, defined retention; German consumer law: consent to immediate performance + withdrawal waiver; PAngV total-price display.

## 5. Design Standard (summary)
Full specification: [design-standard.md](design-standard.md), derived from the Zulex Style Guide (23.04.25).
- Brand: flat, white-dominant, generous margins, one orange accent. Palette — Orange `#F49405`, Grau `#444C54`, Background Blue `#EDF5FC`; type — Kanit (ExtraBold uppercase H1, Light everywhere below), Euro Plate for licence plates only.
- The orange wedge (straight bottom, 1.07° slope down to the right) closes page sections; it is the only non-square form in the system.
- **White text on brand orange fails contrast (2.31:1)** — primary buttons are `#272828` on orange; focus rings are `#272828`, never orange.
- German first, plain language (no Amtsdeutsch without explanation); every security-code field is paired with a photograph of where that code is found.
- Mobile-first, single-column funnel, one decision per screen; progress indicator throughout.
- Trust cues: total price always visible, "official process via KBA" messaging, no dark patterns, explicit consent checkboxes.
- Accessibility WCAG 2.1 AA; status journey rendered as a vertical stepper that works in email-adjacent contexts too.
- Errors: human-readable, action-oriented ("Check the 3-character code on the rear plate seal"), never raw API text. Semantic colours are an approved extension to the brand — orange never signals an error.

## 6. Success Criteria
- ≥70% of users who start the form reach payment; ≥90% of paid applications submitted to KBA without a 400.
- First-attempt KBA acceptance ≥85%; correctable rejections recovered via PATCH ≥60%.
- Median time from payment to "Completed" visible to the user, with correct step shown at all times (status accuracy = 100% against backend state).
- 0 incidents of security-code exposure in logs, emails, or status pages; 0 client-side API-key exposure.
- Support contact rate <5% of orders; chargeback rate <0.5%.
