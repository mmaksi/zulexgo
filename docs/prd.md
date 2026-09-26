# ZulexGO B2C — Product Requirements Document (MVP: Vehicle De-registration)

Business logic — statuses, error handling, payment, refunds — follows [launch-plan.md](launch-plan.md), the source of truth when documents disagree. Open points are numbered there Q1–Q18 and cited below by number.

## 1. Vision
Let any private vehicle owner in Germany de-register their vehicle (Außerbetriebsetzung) fully online — no Zulassungsstelle appointment, no account, no paperwork mailed. ZulexGO wraps the B2B Zulex API in a guided, trustworthy consumer flow: check eligibility, enter the codes from documents and plates, pay, verify identity, follow every step to the official KBA confirmation.

## 2. User Personas
- **Private seller ("Sabine, 42")** — sold or scrapped her car; needs the official deregistration confirmation fast so insurance and tax stop. Non-technical; needs plain-language guidance on where the security codes are.
- **Motorcycle/seasonal owner ("Timo, 29")** — de-registers his motorcycle each winter. Price-sensitive, mobile-first, one sitting; one plate.
- **Helper for a relative ("Jonas, 35")** — acts for a parent using the parent's physical documents. Needs a shareable status link and a clear statement of who the applicant is.

Out of scope for MVP: fleet managers, dealers (served by B2B), legal entities.

## 3. Feature List
**Must-Have**
- Guided service selection (de-registration only; other services shown as "coming soon")
- Early eligibility check: German plate, documents & plate seals with intact security codes, one-vs-two plates, authority availability (sets processing-time expectation)
- Contextual form: front-plate code shown only for two-plate vehicles; plate reservation removed from the MVP
- Full client-side validation matching API patterns before payment
- Online payment with the full price and the processing-fee notice shown before paying
- Order confirmation with order ID and status link
- Identity verification (Verimi)
- Account-free status dashboard via one-time link, showing the seven customer statuses, with an email on every status change and on every refund
- Automatic, silent retry of technical errors before the customer is told anything
- Correction flow for correctable failures, with the option to cancel instead
- Clear end states: success with the official confirmation PDF, correctable failure, non-correctable failure with refund
- Legal baseline: Impressum, AGB, privacy policy, T&Cs and right of withdrawal before payment

Statuses, emails, the error algorithm, payment and refund amounts: [launch-plan.md](launch-plan.md). Content per screen: [site-contract.md](site-contract.md).

**Should-Have**
- "Resend my status link" recovery by email + reference number (a launch-plan assumption, not in the business logic)
- Duplicate-application warning (same plate + VIN with open application)
- German + English UI (German primary)

**Nice-to-Have**
- Plate/VIN scan via camera (OCR)
- SMS status notifications
- Post-completion cross-sell (reactivation reminder for seasonal vehicles)

## 4. Technical Constraints
Each constraint has one home; this section only points to it.
- **Stack, server-side-only Zulex calls, vendors behind ports, stages by `APP_ENV`:** `CLAUDE.md` § Stack.
- **Status machine, polling, idempotency, payment and capture, refunds, emails:** [launch-plan.md](launch-plan.md) — the decisions table and M2–M6.
- **Security codes, status tokens, logging, GDPR, retention, consumer law, PAngV:** `CLAUDE.md` § Non-negotiables and [launch-plan.md](launch-plan.md) M7.
- **What the Zulex API does not provide** — status granularity, timestamps, webhooks, error bodies, identity verification: [deregistration-user-journeys.md](deregistration-user-journeys.md) § API & business problems.

## 5. Design Standard (summary)
Full visual spec: [design-standard.md](design-standard.md), derived from the Zulex Style Guide (23.04.25). Product intent: trustworthy and official, not playful; German first, plain language; mobile-first, one decision per screen; WCAG 2.1 AA; no dark patterns.

## 6. Success Criteria
- ≥70% of users who start the form reach payment; ≥90% of paid applications submitted to KBA without a 400.
- First-attempt KBA acceptance ≥85%; correctable failures (5b) recovered via correction ≥60%.
- Median time from payment to "Completed" visible to the user, with correct step shown at all times (status accuracy = 100% against backend state).
- 0 incidents of security-code exposure in logs, emails, or status pages; 0 client-side API-key exposure.
- Support contact rate <5% of orders; chargeback rate <0.5%.
