# Site Contract — ZulexGO B2C (De-registration MVP)

Page structure, section content, site behaviour. Business rules: [launch-plan.md](launch-plan.md); visual rules: [design-standard.md](design-standard.md).

## 1. Page Structure

**Landing page (`/`)**
1. Header — brand, minimal nav; orientation and trust.
2. Hero — value proposition; routes into the funnel.
3. Service selection — de-registration actionable; future services visible-but-disabled.
4. Trust strip — answers "is this official/safe?" before the funnel.
5. How it works — effort and document expectations in four steps.
6. FAQ — objections that would otherwise become support tickets.
7. Footer — legally required links, support contact.

**Funnel (`/deregister`, one step per screen)**
1. Progress indicator — current position, how much remains.
2. Eligibility check — stops ineligible users before effort or money.
3. Application form — exactly the API-required fields, contextually.
4. Review & payment — confirm data, full price, 19.99 € processing-fee notice, consent, payment.
5. Confirmation — order ID, status link, announces the identity-verification email.

**Status dashboard (`/status/{token}`)**
1. Vehicle summary — which application this is.
2. Status stepper — seven customer statuses (1 → 2 → 3 → 4 → 5a | 5b | 5c), current position.
3. Outcome block — 5a: success documents; 5b: reason, correct-or-cancel choice, fee notice; 5c/cancelled: reason, refund info, new-application CTA.
4. Correction form (conditional) — fix and resubmit rejected data in place.
5. Help block — lost-link recovery, support.

**Legal pages (`/impressum`, `/agb`, `/datenschutz`)** — single-column static text; statutory duties.

## 2. Content Model

Per section, page order: fields with constraints (length / format / tone). Tone: plain German, reassuring, no unexplained Amtsdeutsch. Statuses, emails, refund rules per [launch-plan.md](launch-plan.md); open points are its Q1–Q18. Scope: Must-Have only.

### 2.1 Landing / Service Selection
- **Header** — logo, nav links, language toggle. Nav ≤3 items, labels ≤20 chars.
- **Headline** — value proposition ("De-register your vehicle online"). ≤60 chars.
- **Subline** — how it works, one sentence, mentions "official, via KBA". ≤140 chars.
- **Service cards** (1 active + disabled "coming soon") — title ≤30, one-line description ≤90, price from €X, CTA ≤20 chars.
- **Trust strip** — 3 items (official process, secure payment, status tracking): icon + label ≤40 chars.
- **How-it-works steps** — exactly 4: title ≤30, text ≤120 chars.
- **FAQ** — 5–8 items: question ≤80, answer ≤400 chars.
- **Footer** — legal links (Impressum, AGB, Datenschutz), support email. Static labels.

### 2.2 Eligibility Check (step 0)
- **Progress indicator** (whole funnel) — 4 step labels ≤20 chars.
- **Intro text** — prerequisites (Teil I document, intact plate seals). ≤300 chars.
- **Questions** (radio/toggle): plate count (1/2), documents at hand (y/n), plate prefix (1–3 letters `[A-ZÄÖÜ]`).
- **Authority availability notice** — from `ikfzStatus`: 3 variants (online / unavailable / offline), ≤200 chars each; sets processing-time expectation.
- **Stop message** — if ineligible; explains offline alternative. ≤300 chars.

### 2.3 Application Form (contextual)
Per field: label ≤40, helper ≤150, locator image (where to find it), error ≤120 chars — human-readable, action-oriented ("Check the 3-character code on the rear plate seal"), never raw API text.
- **Licence plate** — 3 inputs: `[A-ZÄÖÜ]{1,3}` / `[A-Z]{1,2}` / 1–4 digits, no leading 0. Auto-uppercase.
- **VIN** — 1–17 chars `[A-Z0-9]`; warn (not block) if ≠17.
- **Certificate part 1 security code** — exactly 7 alphanumeric; masked.
- **Rear plate security code** — exactly 3 alphanumeric.
- **Front plate security code** — exactly 3 alphanumeric; only if plate count = 2.
- **Email** — RFC-valid; for status updates, Verimi link, one-time status link. Consent microcopy ≤200 chars.

### 2.4 Review & Payment
- **Order summary** — read-only echo of all fields (codes masked).
- **Price block** — service fee + authority fee + VAT = total (PAngV-compliant); EUR, always visible.
- **Processing-fee notice** — 19.99 € retained if customer cancels after a correctable failure or application cannot be corrected. Clear, visible before pay button. Legally reviewed, ≤200 chars, links to AGB clause.
- **Consent checkbox** (required): T&Cs and right of withdrawal, before payment. Second immediate-performance consent depends on Q13. Legally reviewed, ≤300 chars.
- **Stripe Payment Element** — card (Visa, Mastercard), SEPA Direct Debit, Apple Pay, Google Pay. Stripe-hosted copy.
- **Submit CTA** — "Pay & submit" ≤25 chars; disabled-state hint ≤80 chars.

### 2.5 Confirmation
- **Success headline** ≤60 chars; **order ID** `ZG-XXXXXX`; **status link notice** "link sent to {email}" ≤150 chars; **next-steps text** — mentions the following identity-verification email, ≤300 chars.

### 2.6 Status Dashboard (one-time link)
- **Vehicle summary** — plate + masked VIN only; never security codes.
- **Status stepper** — seven customer statuses; per step: title ≤50, status line ≤50, description ≤150 chars, timestamp (our backend), state (done/current/pending/failed). Titles/status lines = the seven statuses and internal labels in `launch-plan.md` § Context; status 1 wording depends on Q7.
- **Outcome block** variants:
  - *5a* — success text ≤300 chars + documents list.
  - *5b* — reason (rewritten from `errorInfo`) ≤300; CTA "Correct data" ≤25; CTA "Cancel" ≤25 with adjacent fee notice ("19.99 € is retained, the rest is refunded") ≤150 chars.
  - *5c* — reason ≤300; refund info (amount minus 19.99 €) ≤200; CTA "Start a new application" ≤30 chars.
  - *Cancelled* — refund info (amount minus 19.99 €) ≤200; CTA "Start a new application" ≤30 chars.
- **Correction form** — fields/constraints as §2.3, prefilled except codes; `PATCH` on submit; charges price difference only if one arises (Q11).
- **Documents list** — per document: type label (enum map: confirmation, fee, rejection, unknown→"Document") ≤40 chars, download button.
- **Help block** — support email + "resend link" entry (needs email + order ID), ≤150 chars.

### 2.7 Transactional Emails
Eight emails (trigger, subject, content): table in `launch-plan.md` § M5, plus resend-link email (launch-plan assumption). Per email: **subject** ≤70 chars incl. order ID; **body** ≤600 chars, one status statement + CTA button; no personal data beyond plate + order ID; never a security code; none during the silent automatic retry. German wording is a translation task.

### 2.8 Content gaps (open in the launch plan)
1. **Identity-verification content (status 2–3, emails 2–3)** — depends on who integrates Verimi and whether de-registration needs it (Q1–Q4); Verimi deadline wording on Q14.
2. **Rejection reason copy and 5b/5c split** — depend on undocumented `errorInfo` code catalogue, Q10, Q18. Until it exists, unrecognised error → 5b (launch-plan fallback).
3. **Timestamps** — only backend-owned steps have them; API-side transitions don't, so we timestamp at poll time (approximate; acceptable, note it).
4. **Status 1 wording** — "Payment captured" vs "payment authorised" depends on when a held card payment is captured (Q7).
5. **Authority fee amount** — API returns fees only as post-hoc `FEE` document; displayed price comes from our own table (launch-plan assumption: one all-inclusive price per plate count). Source and maintenance owner undefined.
6. **Special plates (E/H/seasonal)** — eligibility warns "may be rejected" until API provider clarifies.

## 3. Behaviour Spec

**Navigation**
- Landing header sticky. Funnel replaces nav with progress indicator + single "back"; only other exit is the logo (confirm-dialog if form dirty).
- Funnel linear; forward only via validated CTA; browser back = one step, state preserved (client state, never in URL).
- Status dashboard only via token link; invalid/expired token → neutral error page with resend flow (no existence disclosure). All Zulex API traffic server-side.

**Scroll**
- Landing: normal scroll, no scroll-jacking; anchor scroll from "how it works" CTA smooth (`scroll-behavior: smooth`), respects `prefers-reduced-motion`.
- Funnel: each step fits one viewport on desktop; step change resets scroll to top; failed submit scrolls first invalid field into view and focuses it.
- Status page: current step auto-scrolled into view on load.

**Hover states (desktop only; never required for meaning)**
- Buttons: background one shade darker, 120 ms ease; disabled: no hover, `not-allowed` cursor + hint text.
- Cards/links: card lifts (2 px translate + shadow); text links underline.
- Form fields: border darkens on hover; accent 2 px ring on focus (focus ≠ hover).
- Info icons (code locators): tooltip on hover/focus; tap-to-toggle on touch.

**Mobile (<768 px)**
- Single column; service cards and trust strip stack; how-it-works vertical list.
- Progress indicator collapses to "Schritt 2 von 4".
- Funnel CTA docks as sticky bottom bar, with total price on payment step.
- Stepper vertical at all sizes (incl. desktop); locator images open full-width in bottom sheet, not tooltip.
- Correct keyboards (`inputmode`), auto-uppercase plate/VIN/codes; tap targets ≥44 px.

**Transitions & animations**
- Step change: 150 ms fade/slide; skipped under `prefers-reduced-motion`.
- Stepper: current step pulses subtly while polling; on status change, completed steps get one-time 200 ms check-draw (page revalidates on focus/interval — no manual refresh).
- Payment/submit: CTA → inline spinner, locked (idempotency guard); no full-page loaders.
- Errors: 100 ms fade, layout shift ≤ message height; no validation toasts — errors live at the field.
