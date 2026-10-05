# Site Contract — ZulexGO B2C (De-registration MVP; Neuzulassung built, not on sale)

Page structure, section content, site behaviour. Business rules: [launch-plan.md](launch-plan.md); visual rules: [design-standard.md](design-standard.md).

## 1. Page Structure

**Landing page (`/`)**
1. Header — brand, minimal nav; orientation and trust.
2. Hero — value proposition; routes into the funnel.
3. Service selection — a service is actionable only while it is in the stage's `SERVICES_ON_SALE` (de-registration alone by default); the others are visible-but-disabled. A service in its beta also says "Nur mit Einladung" and stays linked.
4. Trust strip — answers "is this official/safe?" before the funnel.
5. How it works — effort and document expectations in four steps.
6. FAQ — objections that would otherwise become support tickets.
7. Footer — legally required links, support contact.

**Funnel (`/deregister`, one step per screen)**
1. Progress indicator — current position, how much remains.
2. Eligibility check — stops ineligible users before effort or money.
3. Application form — exactly the API-required fields, contextually.
4. Review & payment — confirm data, full price, 19.99 € processing-fee notice, consent, payment.
5. Confirmation — order ID, status link; announces the identity-verification email once Verimi is added. `/deregister/bestaetigung` shows it where Stripe redirects a payment.

The Neuzulassung funnel (`/register`) has seven steps; its contract is §4.

**Status dashboard (`/status/{token}`)**
1. Vehicle summary — which application this is.
2. Status stepper — customer statuses 1 → 4 → 5a | 5b | 5c, current position; a Neuzulassung has 2 (identity check) and 3 (identity confirmed) between 1 and 4 (§5).
3. Outcome block — 5a: success documents; 5b: reason, correct-or-cancel choice, fee notice; 5c/cancelled: reason, refund info, new-application CTA.
4. Correction form (conditional) — fix and resubmit rejected data in place.
5. Help block — lost-link recovery (`/status/link-anfordern`), support.

**Legal pages (`/impressum`, `/agb`, `/datenschutz`)** — single-column static text; statutory duties.

## 2. Content Model

Per section, page order: fields with constraints (length / format / tone). Tone: plain German, reassuring, no unexplained Amtsdeutsch. Statuses, emails, refund rules per [launch-plan.md](launch-plan.md); open points are its numbered open questions (Qn). Scope: Must-Have only.

### 2.1 Landing / Service Selection
- **Header** — logo, nav links, the primary action; no language toggle (the German + English UI is a Should-Have in `prd.md`). Nav ≤3 items, labels ≤20 chars.
- **Headline** — value proposition ("De-register your vehicle online"). ≤60 chars.
- **Subline** — how it works, one sentence, mentions "official, via KBA". ≤140 chars.
- **Hero seal** — the founder's "KBA-zertifiziert" seal (`public/kba-zertifiziert.png`), shown unaltered, never rounded, tinted or recoloured: beside the headline from 1024 px, below the buttons on smaller screens so it never pushes the CTA down. The alt text repeats the claim the seal prints.
- **Service cards** (those on sale active, the rest disabled "coming soon"; one in beta also carries the note "Nur mit Einladung", ≤20 chars) — title ≤30, one-line description ≤90, fixed final price from the price list, CTA ≤20 chars. A note under the cards lists the add-on prices and says plates and sticker are ordered and charged only after the KBA has completed the service.
- **Trust strip** — 3 items (official process, secure payment, status tracking): icon + label ≤40 chars.
- **How-it-works steps** — exactly 4: title ≤30, text ≤120 chars.
- **FAQ** — 5–8 items: question ≤80, answer ≤400 chars.
- **Footer** — legal links (Impressum, AGB, Datenschutz), support email, and the same seal at the end of the row; on the dark footer it sits on a white tile, because the file is transparent with dark lettering. Static labels.

### 2.2 Eligibility Check (step 0)
- **Progress indicator** (whole funnel) — 4 step labels ≤20 chars.
- **Intro text** — prerequisites (Teil I document, intact plate seals). ≤300 chars.
- **Questions** (radio/toggle): plate count (1/2), documents at hand (y/n), plate prefix (1–3 letters `[A-ZÄÖÜ]`).
- **Authority availability notice** — shown on the next step, from `ikfzStatus`: 3 variants (online / unavailable / offline), ≤200 chars each; sets processing-time expectation.
- **Stop message** — if ineligible; explains offline alternative. ≤300 chars.

### 2.3 Application Form (contextual)
Per field: label ≤40, helper ≤150, locator image (where to find it), error ≤120 chars — human-readable, action-oriented ("Check the 3-character code on the rear plate seal"), never raw API text.
- **Licence plate** — 3 inputs: `[A-ZÄÖÜ]{1,3}` / `[A-Z]{1,2}` / 1–4 digits, no leading 0. Auto-uppercase.
- **VIN** — 1–17 chars `[A-Z0-9]`; warn (not block) if ≠17.
- **Certificate part 1 security code** — exactly 7 alphanumeric; masked.
- **Rear plate security code** — exactly 3 alphanumeric.
- **Front plate security code** — exactly 3 alphanumeric; only if plate count = 2.
- **Email** — RFC-valid; for status updates, the status link, and the Verimi link once Verimi is added. Consent microcopy ≤200 chars.

### 2.4 Review & Payment
- **Order summary** — read-only echo of all fields (codes masked).
- **Price block** — service fee + authority fee + VAT = total (PAngV-compliant); EUR, always visible.
- **Processing-fee notice** — 19.99 € retained if customer cancels after a correctable failure or application cannot be corrected. Clear, visible before pay button. Legally reviewed, ≤200 chars, links to AGB clause.
- **Consent checkbox** (required): T&Cs and right of withdrawal, before payment. Second immediate-performance consent depends on Q13. Legally reviewed, ≤300 chars.
- **Stripe Payment Element** — card (Visa, Mastercard), SEPA Direct Debit, Apple Pay, Google Pay. Stripe-hosted copy.
- **Submit CTA** — "Pay & submit" ≤25 chars; disabled-state hint ≤80 chars.

### 2.5 Confirmation
- **Success headline** ≤60 chars; **order ID** `ZG-XXXXXX`; **status link notice** "link sent to {email}" ≤150 chars; **next-steps text** — mentions the following identity-verification email once Verimi is added, ≤300 chars.

### 2.6 Status Dashboard (status link)
- **Vehicle summary** — plate + masked VIN only; never security codes.
- **Status stepper** — the customer statuses as three rows for a de-registration (1, 4 and the outcome 5a | 5b | 5c) and five for a Neuzulassung, which adds the identity check; per step: title ≤50, status line ≤50, description ≤150 chars, timestamp (our backend), state (done/current/pending/failed). Titles/status lines = the statuses and internal labels in `launch-plan.md` § Context; status 1 wording depends on Q7.
- **Outcome block** variants:
  - *5a* — success text ≤300 chars + documents list.
  - *5b* — reason (our wording from the rejection catalogue, never `errorInfo`'s) ≤300; the correction form and the CTA "Antrag stornieren" ≤25 with the adjacent fee notice ("19.99 € is retained, the rest is refunded") ≤150 chars; cancelling asks for confirmation in a dialog that repeats the amounts.
  - *5c* — reason ≤300; refund info (amount minus 19.99 €) ≤200; CTA "Start a new application" ≤30 chars.
  - *Cancelled* — refund info (amount minus 19.99 €) ≤200; CTA "Start a new application" ≤30 chars.
- **Correction form** — the VIN and the security codes (the front code only for two plates), with the constraints and wording of §2.3; it starts empty, so no stored value is put back on the page, and a field left blank stays as it was; the plate is not correctable (Q26); "Erneut einreichen" sends a `PATCH` of the changed fields, or files the order afresh when Zulex holds nothing to patch (Q37). A correction costs nothing extra (Q11).
- **Documents list** — per document: type label (enum map: confirmation, temporary certificate, fee, rejection, unknown→"Document") ≤40 chars, download button.
- **Help block** — support email + "resend link" entry (needs email + order ID), ≤150 chars.

### 2.7 Transactional Emails
Eight emails (trigger, subject, content): table in `launch-plan.md` § M5, plus a reminder to verify and the resend-link email (launch-plan assumption). Emails 2 and 3 and the reminder are sent for a Neuzulassung only; a de-registration does not verify (Q4). Per email: **subject** ≤70 chars incl. order ID; **body** ≤600 chars, one status statement + CTA button; no personal data beyond order ID (and a de-registration's plate); never a security code; none during the silent automatic retry. German wording is a translation task.

### 2.8 Content gaps (open in the launch plan)
1. **Identity-verification content (status 2–3, emails 2–3)** — built for a Neuzulassung on provisional answers (Q45–Q48, §5), with the fake identity adapter; the real one depends on who integrates Verimi (Q1–Q3), and whether de-registration needs it is Q4; Verimi deadline wording on Q14.
2. **Rejection reason copy and 5b/5c split** — depend on undocumented `errorInfo` code catalogue, Q10, Q18. Until it exists, unrecognised error → 5b (launch-plan fallback).
3. **Timestamps** — only backend-owned steps have them; API-side transitions don't, so we timestamp at poll time (approximate; acceptable, note it).
4. **Status 1 wording** — "Payment captured" vs "payment authorised" depends on when a held card payment is captured (Q7).
5. **Authority fee amount** — API returns fees only as post-hoc `FEE` document; displayed price comes from our own table (the founder's price list: one all-inclusive price per service, in `src/core/domain/payment/pricing.ts`). The monthly reconciliation against the `FEE` documents has no owner yet.
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

## 4. Neuzulassung Funnel (`/register`)

Built on the shared funnel frame and payment panel (`app/(funnel)/_components/`), so §3's navigation, scroll, mobile and transition rules apply unchanged. **Not on sale:** while a stage's `SERVICES_ON_SALE` does not list `newRegistration` (the default; `registration-plan.md` N9) the route and its confirmation page are not found there, because the funnel collects an IBAN and a birth date for an order checkout would refuse. Business rules: `registration-plan.md` and [launch-plan.md](launch-plan.md); the provisional answers it builds are Q46, Q49, Q51, Q54 and Q56.

**Form state** lives in memory only, never in the URL or browser storage; leaving through a link asks first, closing the tab gets the browser's warning, going back keeps what was entered. The form is checked against the server's own request schema (`newRegistrationRequestSchema`), so it says no exactly where checkout would. Error wording follows §2.3 (≤120 chars, human, action-oriented). A caller who asks too often (the postcode check 30 an hour, the checkout 10 an hour, per address) is told how long to wait and stays on the step; the order is not lost, and the pay button works again once the time has passed.

**Invite gate (both funnels, N9).** While the service is in `BETA_SERVICES`, a browser that has not redeemed a code `submitCheckout` still accepts sees one screen in place of the funnel: the heading "Nur mit Einladung", one sentence, one field "Einladungscode" and "Weiter". A wrong code is said at the field and keeps what was typed; an address that tries too often (10 an hour) is told how long to wait; a check that cannot run says so and does not call the code wrong. A code is accepted whatever its case or spacing, kept in an HttpOnly cookie for a week, and checked again at checkout, so a revoked code stops working at once and the customer is told their invite no longer applies. When the day's places are taken the pay button says so and that tomorrow they can try again.

### 4.1 Steps

Seven labels ≤20 chars: Voraussetzungen, Fahrzeug, Halter, Kennzeichen, Kfz-Steuer, Prüfen & bezahlen, Bestätigung. Shown as "Schritt 2 von 7" until 1024 px, as a row above.

1. **Voraussetzungen** — five yes/no questions (a brand-new car never registered; Teil II with its concealed code; the eVB number; a private keeper of 18 or over who lives in Germany; a German bank account) and the keeper's postcode, which picks the authority (`GET /registration-authorities?postcode=`). Every "no" shows its reason and the offline alternative (≤300 chars) and keeps "Weiter" disabled. The authority notice (online, unavailable, offline; ≤200 chars) is shown on the next step.
2. **Fahrzeug** — VIN, drive (electric, hybrid, petrol or diesel), Teil II number and security code, eVB number.
3. **Halter** — name, sex, birth date and place, address, phone, email. The postcode starts as entered in step 1; changing it asks the authority again before the customer goes on. The email is the order's: status link, verification link and every status email go there.
4. **Kennzeichen** — the authority assigns the plate (no wish plate, Q51). An E-plate is offered only for an electric car; a seasonal plate asks for its first and last month.
5. **Kfz-Steuer** — IBAN, BIC, bank name. The tax is collected from this account by direct debit; it cannot be changed once the application is filed. We keep it only until the order ends (Q54).
6. **Prüfen & bezahlen** — everything entered, grouped (codes masked), price, processing-fee notice, payment, three consents, as §2.4. The consents are the AGB with the withdrawal notice, the early-start waiver (Q13) and the power of attorney with the direct-debit mandate (Q46); each is a required checkbox, and checkout refuses the order without all three.
7. **Bestätigung** — order ID, where the status link went, and that an identity-verification email follows, with its deadline (`VERIFICATION_DEADLINE_AFTER_MS`). Where Stripe redirects a payment, `/register/bestaetigung` shows it.

### 4.2 Fields

Label ≤40 chars, helper ≤150. A field is exactly as the domain parses it.

| Field | Constraint | Input |
|---|---|---|
| FIN | exactly 17 `[A-Z0-9]`, upper-cased as typed | text |
| Antrieb | electric, hybrid or combustion | radio |
| Teil II number | 1–20 characters (Q56) | text |
| Teil II security code | at least 1 character (Q56); masked | password |
| eVB number | 7 characters `[A-HJ-NP-Z0-9]`, no I or O; masked | password |
| First and last name | not empty | text |
| Sex | female, male, diverse, unspecified | radio |
| Birth date | a real date, the keeper at least 18 on the day it is entered | date |
| Birth place | not empty | text |
| Street, city | not empty | text |
| House number | one to four digits, then anything | text |
| Postcode | 5 digits | numeric text |
| Phone | digits, spaces and `+ ( ) / . -`, 6 to 15 digits | tel |
| Email | RFC-valid | email |
| E-plate | only with an electric drive | checkbox |
| Season | first and last month, January to December | select |
| IBAN | German, 22 characters, checksum; spaces and lower case accepted. A wrong checksum is called a probable typo; a wrong country or length says a German IBAN starts with DE and has 22 characters | text |
| BIC | 8 or 11 characters | text |
| Bank name | not empty | text |

### 4.3 Not tested, checked in the browser

Copy, the progress indicator, the locator photos (placeholders until M7) and every layout at phone, tablet and laptop width.

## 5. Neuzulassung after payment (status page and emails)

The status page of §2.6 and the emails of §2.7, for an order whose `service` is `newRegistration`. The page picks its summary, its correction form and its wording by the order's service. Business rules: `registration-plan.md`; the provisional answers it builds are Q47, Q48, Q50, Q53, Q55 and Q56.

- **Summary** — the end of the VIN only: a Neuzulassung has no plate until the authority assigns one, and the API does not say which (Q56).
- **Stepper** — five rows (paid, identity check, identity confirmed, KBA, outcome). While the order waits for the customer's identity check the row names the day and time the wait ends (Berlin time); the page offers nothing to do but verify, and never shows the provider's link.
- **5a** — the documents under their own names ("Bestätigung der Zulassung", "Vorläufiger Zulassungsnachweis", "Gebührenbeleg"), then "Wie geht es weiter?": where the plate is printed, that the authority posts the rest to the keeper's address, that plates are made locally (Q50, Q55). The wording is `NEW_REGISTRATION_NEXT_STEPS`, shared with email 5a; nothing is said about driving on the temporary certificate.
- **5b** has two causes, told apart by whether the identity was ever verified. After a verification mismatch (nothing filed) the form asks for first name, last name and birth date, besides the eVB number and the Teil II; after the registration service sent the order back it asks for the eVB number and the Teil II only. It starts empty, a field left blank stays as it was, and its wording and rules are the funnel's (§4.2). "Korrektur absenden" patches an order Zulex holds, files one it refused afresh, or has the identity checked again for one never verified. The cancel and its fee notice are as §2.6.
- **Cancelled** — a cancel by the customer reads as for a de-registration; a verification that ran out says so and that nothing was filed. "Neuen Antrag stellen" goes to the service's own funnel while it is on sale, otherwise to the start page.
- **Emails** — 1, 4, 5a, 5b and 5c have a Neuzulassung wording, within §2.7's limits. Email 1 says an identity check follows; email 5b says nothing was filed when the check found someone else than the owner.
