# Content Model — ZulexGO B2C (Must-Have scope only)

Sections in page order. Fields: description + constraints (length / format / tone). Tone everywhere: plain German, reassuring, no Amtsdeutsch without explanation.

## 1. Landing / Service Selection
- **Headline** — value proposition ("De-register your vehicle online"). ≤60 chars.
- **Subline** — how it works in one sentence, mentions "official, via KBA". ≤140 chars.
- **Service cards** (1 active + disabled "coming soon" cards) — title ≤30 chars, one-line description ≤90 chars, price from €X, CTA label ≤20 chars.
- **Trust strip** — 3 items: icon + label ≤40 chars each (official process, secure payment, status tracking).
- **How-it-works steps** — exactly 4: title ≤30 chars, text ≤120 chars.
- **FAQ** — 5–8 items: question ≤80 chars, answer ≤400 chars.
- **Footer legal links** — Impressum, AGB, Datenschutz. Static labels.

## 2. Eligibility Check (step 0)
- **Intro text** — what you need before starting (Teil I document, intact plate seals). ≤300 chars.
- **Questions** (radio/toggle): plate count (1/2), documents at hand (y/n), plate prefix (1–3 letters `[A-ZÄÖÜ]`).
- **Authority availability notice** — dynamic from `ikfzStatus`: 3 variants (online / unavailable / offline), each ≤200 chars, sets processing-time expectation.
- **Stop message** — shown when ineligible; explains offline alternative. ≤300 chars.

## 3. Application Form (contextual)
Per field: label ≤40 chars, helper text ≤150 chars, locator image (where to find it), error message ≤120 chars (action-oriented).
- **Licence plate** — 3 inputs; formats `[A-ZÄÖÜ]{1,3}` / `[A-Z]{1,2}` / 1–4 digits no leading 0. Auto-uppercase.
- **VIN** — 1–17 chars `[A-Z0-9]`; warn (not block) if ≠17.
- **Certificate part 1 security code** — exactly 7 alphanumeric; masked input.
- **Rear plate security code** — exactly 3 alphanumeric.
- **Front plate security code** — exactly 3 alphanumeric; rendered only if plate count = 2.
- **Email** — RFC-valid; used for status updates + one-time link. Consent microcopy ≤200 chars.

## 4. Review & Payment
- **Order summary** — read-only echo of all entered fields (codes masked).
- **Price block** — service fee + authority fee + VAT = total (PAngV-compliant); currency EUR, always visible.
- **Consent checkboxes** (2, required): AGB/privacy; immediate-performance + withdrawal waiver. Legally reviewed text, ≤300 chars each.
- **Stripe payment element** — Stripe-hosted copy.
- **Submit CTA** — "Pay & submit" ≤25 chars; disabled-state hint ≤80 chars.

## 5. Confirmation
- **Success headline** ≤60 chars; **reference number** (our order ID, format `ZG-XXXXXX`); **status link notice** — "link sent to {email}" ≤150 chars; **next-steps text** ≤300 chars.

## 6. Status Dashboard (one-time link)
- **Vehicle summary** — plate + masked VIN only; never security codes.
- **Status stepper** — the 7 canonical steps; per step: label ≤50 chars, description ≤150 chars, timestamp (from our backend), state (done/current/pending/failed).
- **Rejection block** (variants: correctable / final) — reason (from `errorInfo`, rewritten human-readable) ≤300 chars; CTA "Correct data" or refund-policy text ≤300 chars.
- **Correction form** — same fields/constraints as §3, prefilled except codes.
- **Documents list** — per document: type label (map enum: confirmation, fee, rejection, unknown→"Document") ≤40 chars, download button.
- **Help block** — support email + "resend link" entry point, ≤150 chars.

## 7. Transactional Emails (one per status change, 7 templates + link-resend)
- **Subject** ≤70 chars incl. reference number; **body** ≤600 chars, one clear status statement + CTA button to status link; no personal data beyond plate + reference.

---

## Gaps flagged (PRD ↔ content model)
1. **Steps 2–3 (identity verification) have no data source** — the de-registration request takes no identity or email, and submission happens at checkout, so nothing ever transitions through them. Default (see `launch-plan.md`): collapse to a 5-step journey, dropping their two email templates. Founder to confirm; the §6/§7 counts above still say 7 until then.
2. **Rejection reason copy depends on the undocumented `errorInfo` code catalogue** — the correctable/final split (§6) is blocked on the API provider's error-handling follow-up.
3. **Timestamps** shown in the stepper exist only for backend-owned steps; API-side transitions carry no timestamps — we timestamp at poll time (approximate; acceptable, but note it).
4. **Refund policy text (rejected-final)** — business decision missing from PRD (full vs. partial refund when pre-auth already captured).
5. **Authority fee amount** for the price block — the API returns fees only as a post-hoc `FEE` document; the displayed price must come from our own fee table. Source and maintenance owner undefined.
6. **Special plates (E/H/seasonal)** — eligibility step has no question for them yet; pending API clarification (may need a stop message variant).
