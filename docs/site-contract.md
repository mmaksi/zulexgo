# Site Contract — ZulexGO B2C (De-registration MVP)

## 1. Page Structure

**Landing page (`/`)**
1. Header — brand, minimal nav, single point of orientation and trust.
2. Hero — states the value proposition and routes the user into the funnel.
3. Service selection — presents de-registration as the actionable service and future services as visible-but-disabled.
4. Trust strip — removes the "is this official/safe?" objection before the funnel.
5. How it works — sets effort and document expectations in four steps.
6. FAQ — answers the objections that otherwise become support tickets.
7. Footer — carries the legally required links and support contact.

**Funnel (`/deregister`, one step per screen)**
1. Progress indicator — tells the user where they are and how much remains.
2. Eligibility check — stops ineligible users before they invest effort or money.
3. Application form — collects exactly the API-required fields, contextually.
4. Review & payment — confirms data, shows the full price, collects consent, takes payment.
5. Confirmation — hands over the reference number and status link.

**Status dashboard (`/status/{token}`)**
1. Vehicle summary — confirms which application the page is about.
2. Status stepper — shows the 7-step journey with the current position.
3. Outcome block — presents success documents, or the rejection reason with correction CTA or refund info.
4. Correction form (conditional) — lets the user fix and resubmit rejected data in place.
5. Help block — recovers lost links and routes to support.

**Legal pages (`/impressum`, `/agb`, `/datenschutz`)** — single-column static text; satisfy statutory duties.

## 2. Content Inventory

*(Constraints abbreviated; canonical field list in `content-model.md`.)*

| Section | Field | Description | Constraints |
|---|---|---|---|
| Header | Logo, nav links, language toggle | Orientation | Nav ≤3 items; labels ≤20 chars |
| Hero | Headline; subline; primary CTA | Value prop + entry | ≤60 / ≤140 / ≤25 chars; verb-first CTA |
| Service selection | Card: title, description, from-price, CTA/state | One active service | ≤30 / ≤90 chars; price in EUR; disabled cards labeled "Bald verfügbar" |
| Trust strip | 3× icon + label | Official, secure, trackable | ≤40 chars each |
| How it works | 4× step title + text | Expectation setting | ≤30 / ≤120 chars |
| FAQ | 5–8× question + answer | Objection handling | ≤80 / ≤400 chars; plain German |
| Footer | Legal links, support email | Compliance | Static |
| Progress indicator | Step labels | Funnel position | 4 labels ≤20 chars |
| Eligibility | Intro; plate-count toggle; documents check; plate prefix input; availability notice; stop message | Gate + expectation | Prefix `[A-ZÄÖÜ]{1,3}`; notice 3 variants ≤200 chars; stop ≤300 chars |
| Application form | Plate (3 inputs); VIN; cert code; rear code; front code (2-plate only); email — each with label, helper, locator image, error | Data capture | API patterns exact; codes masked; errors ≤120 chars, action-oriented |
| Review & payment | Summary (codes masked); price breakdown; 2 consent checkboxes; Stripe element; CTA | Legal + payment | Total incl. VAT + authority fee always visible; consents required, ≤300 chars |
| Confirmation | Headline; reference `ZG-XXXXXX`; link-sent notice; next steps | Handover | ≤60 / — / ≤150 / ≤300 chars |
| Vehicle summary | Plate; masked VIN | Context | Never show security codes |
| Status stepper | 7× label, description, timestamp, state | Journey | ≤50 / ≤150 chars; unknown API status → generic "In Bearbeitung" |
| Outcome block | Success text + document downloads; or rejection reason + CTA/refund text | End state | Reason rewritten from `errorInfo`, ≤300 chars; document labels from type enum, `UNKNOWN` → "Dokument" |
| Correction form | Same fields as application form | Recovery | Prefilled except codes; PATCH on submit |
| Help block | Resend-link flow; support email | Recovery | Resend requires email + reference; ≤150 chars copy |
| Emails | 7 status templates + resend: subject, body, CTA | Notification | Subject ≤70 chars incl. reference; body ≤600 chars; only plate + reference as data |

## 3. Behaviour Spec

**Navigation**
- Landing header is sticky; funnel replaces nav with the progress indicator plus a single "back" affordance — no other exits except the logo (confirm-dialog if form is dirty).
- Funnel steps are linear; forward navigation only via validated CTA; browser back returns one step with state preserved (client state, never in the URL).
- Status dashboard is reachable only via token link; invalid/expired token → neutral error page with resend flow (no existence disclosure). All Zulex API traffic is server-side.

**Scroll**
- Landing: normal scroll; no scroll-jacking; anchor scroll from "how it works" CTA is smooth (`scroll-behavior: smooth`), respecting `prefers-reduced-motion`.
- Funnel: each step fits one viewport on desktop; on step change, scroll resets to top; first invalid field is scrolled into view and focused on failed submit.
- Status page: stepper auto-scrolls the current step into view on load.

**Hover states (desktop only; never required for meaning)**
- Buttons: background darkens one shade, 120 ms ease; disabled buttons show no hover and a `not-allowed` cursor plus hint text.
- Cards/links: card lifts (2 px translate + shadow); text links underline on hover.
- Form fields: border darkens on hover, accent-colored 2 px ring on focus (focus ≠ hover).
- Info icons (code locators): tooltip on hover/focus, tap-to-toggle on touch.

**Mobile (<768 px)**
- Single column throughout; service cards and trust strip stack; how-it-works becomes a vertical list.
- Progress indicator collapses to "Schritt 2 von 4" text.
- Funnel CTA docks as a sticky bottom bar with the total price on the payment step.
- Stepper is vertical at all sizes (also desktop); locator images open full-width in a bottom sheet instead of tooltip.
- Inputs use correct keyboards (`inputmode`), auto-uppercase for plate/VIN/codes; tap targets ≥44 px.

**Transitions & animations**
- Step change: 150 ms fade/slide; skipped under `prefers-reduced-motion`.
- Stepper: current step pulses subtly while polling; completed steps get a one-time 200 ms check-draw when a status change arrives (page revalidates on focus/interval — no manual refresh needed).
- Payment/submit: CTA switches to inline spinner and locks (idempotency guard); no full-page loaders.
- Errors appear with a 100 ms fade, never layout-shifting more than the message height; no toasts for validation — errors live at the field.
