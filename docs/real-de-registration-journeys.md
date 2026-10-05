# Real de-registration journeys

What a customer actually meets today, read from the code on `staging` @ `71409d8` (M0–M6 merged), 2026-09-30.

[deregistration-user-journeys.md](deregistration-user-journeys.md) says what *should* happen (J1–J12, API findings). This file says what *does*. Intent still follows [launch-plan.md](launch-plan.md), which wins when documents disagree; differences are listed in §14.

**Not verified against:** the live Zulex API (down; the adapter has only run against a mock built from `docs/api-1.yaml`), live Stripe, a real inbox, production (does not exist yet). What only those can confirm is in §15.

| Tag | Meaning |
|---|---|
| **[OPEN Qn]** | The founder has not answered launch-plan question *n*. The code runs a provisional answer; §12 lists all of them. |
| **[PLACEHOLDER]** | A stand-in value or text in the code. |
| **[PROVISION]** | Needs an account, key, plan or setting outside the code. |
| **[NOT BUILT]** | Planned, absent. |
| **[GAP]** | A path with no way through, or wrong copy, that the launch plan does not (fully) cover. |

---

## 1. What stops a real order today

| # | Blocker | Tag | Effect on a customer |
|---|---|---|---|
| 1 | **Nothing calls the poller.** `vercel.json` has no `crons`; `/api/internal/poll` is never hit (launch plan D1). | [PROVISION] [GAP] | An order reaches status 4 and stays there. No 5a/5b/5c, no emails 5a/5b/5c, no documents, no capture for hand-processed authorities, no 24 h resubmission, no daily look at a 5b. Needs a cron entry and a Vercel plan that allows per-minute cron (Hobby is non-commercial and daily-only). Deferred while Zulex is down. |
| 2 | **Zulex API is down / never used.** Staging runs `REGISTRATION_DRIVER=fake`. The fake accepts every prefix as `online` and reports every application *in progress* for ever; a deployed instance cannot script it. | [PROVISION] | On staging no new order can leave status 4. Zulex integration key, per-stage key question and the status webhook request are still open (`docs/provisioning.md` §5). |
| 3 | **Rejection catalogue is empty.** `REJECTION_CATALOGUE = {}` | [OPEN Q10] | Every KBA error code is "unknown": one silent retry, then 5b with one general sentence. **A KBA error can never reach 5c today**, so the "refund minus 19.99 €" 5c path is built but unreachable. |
| 4 | **Price is a stand-in:** 50.00 € + 19.99 € = 69.99 €. Landing says "ab 29,00 €" and "Endpreis". | [PLACEHOLDER] [OPEN Q19] | Customer sees two different prices. |
| 5 | **Legal text missing.** `/agb` says "In Vorbereitung" while checkout requires accepting the AGB and the Widerrufsbelehrung. Consent is required but never stored (D9). No rule for withdrawal within 14 days. | [NOT BUILT] [OPEN Q13] | Cannot lawfully take money yet. |
| 6 | **No identity verification.** The flow is 1 → 4. Verimi (statuses 2–3, emails 2–3) is not built. | [NOT BUILT] [OPEN Q1–Q4] | Anyone holding the codes can order (Q24). |
| 7 | **Production does not exist.** Vercel `zulexgo`, production Supabase, live Stripe (KYC pending), Zulex production key, domain and mail DNS. The config layer refuses any fake driver in production. | [PROVISION] | — |

---

## 2. Stages: what is real where

| | dev | staging (today) | production |
|---|---|---|---|
| Payment | fake ("Testmodus", no money), or Stripe test mode with `stripe listen` | Stripe sandbox (cards only) | live Stripe, not set up |
| Registration (Zulex) | fake | **fake** | Zulex production, not set up |
| Mail | console; prints the status link | Resend, only `MAIL_ALLOWLIST` recipients (others dropped, logged) | Resend, not set up |
| Database | in memory, seeded at boot | Supabase Postgres, seeded on deploy | Supabase, never seeded, not set up |
| Documents | in memory | Supabase Storage bucket `kba-documents` (whether `STORAGE_DRIVER=supabase` is flipped is not recorded in the repo) | not set up |

The 7 seeded orders (one per status) open at `/status/seed-status-link-<status>` in dev and staging. Their links are in the repo, so on staging anyone can open or rotate them.

---

## 3. The order's states

| From | Event | To |
|---|---|---|
| `awaiting_payment` | payment held or captured (Stripe webhook) | 1 |
| 1 | Zulex accepts the application | 4 |
| 1 | `400` on the first try | 5b |
| 1 | 24 h without a confirmed filing | 5c |
| 4 | `FINISHED` (with a confirmation, or with no documents) | 5a |
| 4 | `ERROR` twice, or `FINISHED` with only a rejection document | 5b |
| 4 | KBA code marked *final* in the catalogue | 5c — unreachable today (catalogue empty) |
| 5b | customer corrects, Zulex holds the application | 4 |
| 5b | customer corrects, Zulex never held it | 1 |
| 5b | customer cancels | `cancelled` |

| Status | Customer sees | Email on entering | Polled |
|---|---|---|---|
| `awaiting_payment` | nothing (no link exists yet) | — | no |
| `submitted_and_paid` (1) | "Antrag eingegangen · Zahlung erhalten" | 1 | yes: silent resubmission |
| `submitted_to_kba` (4) | "An das KBA übermittelt · KBA bearbeitet" | 4 | yes: status check |
| `completed` (5a) | "Abmeldung abgeschlossen" + downloads | 5a | no |
| `failed_correctable` (5b) | "Korrektur erforderlich" + correct/cancel | 5b | daily, for its money only |
| `failed_final` (5c) | "Antrag abgelehnt" + refund info | 5c, then 6 | no |
| `cancelled` | "Antrag storniert" + refund info | 6 | no |

`completed`, `failed_final`, `cancelled` are terminal. A new attempt is always a new order at full price.

---

## 4. Happy paths

### H1 — two plates, online authority

| # | Customer | System |
|---|---|---|
| 1 | Landing → "Jetzt abmelden" → `/deregister`. | — |
| 2 | **Eligibility:** picks 1 or 2 plates, confirms it has Teil I and plates with intact seals, types the prefix (1–3 letters). "Weiter" is enabled only when all three are given. | `GET /registration-authorities?licencePlatePrefix=…`. If a prefix has several authorities, the slowest `ikfzStatus` wins. |
| 3 | **Vehicle:** sees the availability notice (online: "meist in wenigen Minuten bis Stunden"). Enters plate (prefix / letters / 1–4 digits, no leading 0), FIN (1–17 `A-Z0-9`, a non-blocking warning if not 17), rear code (3), front code (3, two plates only), certificate code (7, masked), email. | Client validation with the same zod rules the server uses. Nothing is sent yet. State lives in memory only. |
| 4 | **Review & pay:** sees masked summary, price, the 19.99 € fee notice, the Stripe Payment Element (cards, Apple Pay, Google Pay), two consent boxes (AGB + Widerrufsbelehrung; express early start / loss of withdrawal right). "Jetzt bezahlen" stays disabled until both are ticked. | — |
| 5 | Clicks pay. | `elements.submit()` → server action: both consents present, request re-validated, duplicate check (B8), authority looked up again, **Stripe PaymentIntent created** (manual capture, `order_id` = reference, `service_type`), application stored as `awaiting_payment` with the codes AES-GCM encrypted, reference `ZG-XXXXXX` and a random Zulex idempotency key. Returns the client secret. Browser then calls `stripe.confirmPayment` in place. |
| 6 | Sees "Ihr Antrag ist eingegangen", the reference, "Statuslink ist unterwegs an …". | — |
| 7 | (can close the tab) | **Stripe webhook** `payment_intent.amount_capturable_updated` (card held), signature checked → `confirmPayment`: payment must be held/captured; 256-bit status token issued; **email 1**; status 1; poll due now; then inline: |
| 8 | — | `submitToKba`: `POST /deregistration-applications` with `X-Idempotency-Key`. On `201` the Zulex `applicationId` is saved first; online authority → **card captured in full**; **email 4**; status 4; first check due in 1 min; Stripe PaymentIntent tagged with `application_id` (best effort). |
| 9 | Opens the link: step 1 done, step 4 pulsing, outcome pending. Page re-asks the server every 30 s and on focus. | — |
| 10 | — | **Cron (not scheduled, §1)** hits `/api/internal/poll` (bearer `CRON_SECRET`, 50 due orders per call, oldest first). Checks at +1, 2, 5, 10, 30 min, then hourly: `GET /deregistration-applications/{id}`. |
| 11 | — | `FINISHED`: every document fetched (`GET /documents/{id}`) and stored privately; card already captured, nothing more to take; **email 5a**; status 5a. |
| 12 | Status page: "Abmeldung abgeschlossen. Kfz-Steuer und Versicherung enden automatisch" [OPEN Q30] and a download button per document; confirmation first. | PDF streamed only behind the token. |

Steps 1–8 run inside one webhook request; the Zulex call may take up to 15 s.

### H2 — one plate (motorcycle, trailer)
As H1 but: no front-code field, 2 masked codes in the summary, no `frontLicencePlateSecurityCode` in the API body.

### H3 — hand-processed authority (`unavailable` / `offline`)
As H1 except:
- Notice and email 4 say "kann einige Tage dauern".
- The card **stays held** after filing [OPEN Q7].
- Checks at +6 h, 12 h, 18 h, 24 h, then daily.
- Every check also looks at the hold: when it is within 48 h of lapsing (Stripe holds last 7 days; about day 5), the card is captured in full [OPEN Q20]. Otherwise the card is captured when the KBA finishes.
- Needs the cron. Without it the hold lapses and the order finishes unpaid (§8, K9).

---

## 5. Before payment

| ID | Situation | What happens |
|---|---|---|
| B1 | "Nein" to documents | Warning: online not possible, go to the local authority. "Weiter" disabled. Nothing stored. |
| B2 | Prefix unknown to Zulex (empty list) | "Für dieses Ortskürzel finden wir keine Zulassungsstelle …". *Fake gateway (dev, staging) accepts everything.* |
| B3 | Zulex unreachable or answers badly | "Die Zulassungsstelle ist gerade nicht zu erreichen …". Every non-validation error looks the same to the customer; the log names the error type. |
| B4 | Authority not online | Warning notice with days-long expectation; customer may continue. |
| B5 | E/H/seasonal plate (checkbox) | Warning "kann abgelehnt werden"; not blocked; nothing about it goes to Zulex. The plate field takes digits only, so a suffix cannot be typed [OPEN Q39, Q23]. |
| B6 | Field errors | Message under the field, focus on the first bad one. |
| B7 | Customer changes the prefix on the vehicle step | The availability notice is **not** recomputed; checkout re-reads the authority for the final prefix, so the stored `ikfzStatus` (which drives polling and hold handling) can differ from the notice the customer saw [GAP]. |
| B8 | Same plate + VIN already has a paid, unfinished order (1, 4 or 5b) | First "pay" click stops: "Für dieses Fahrzeug läuft bereits ein Antrag …" plus a third checkbox. Says nothing about the other order. Unpaid, finished, failed and cancelled orders don't count. Two racing checkouts can both pass. The check isn't rate-limited (M7), so it can be probed with guessed VINs [OPEN Q38]. |
| B9 | Leaves mid-funnel (steps 2–3) | Link click → "Antrag verlassen?"; close/reload → browser prompt; Back goes one step. A reload loses everything. |
| B10 | Consent unticked | Button disabled; the server refuses too. Consent is not stored [D9]. |
| B11 | Server-side validation fails | "Einige Angaben sind nicht gültig. Bitte gehen Sie einen Schritt zurück …". |
| B12 | Any other checkout failure (Zulex lookup, Stripe, database) | "Das hat gerade nicht geklappt …". |
| B13 | Reloaded *after* paying | Funnel restarts at step 0 with nothing remembered. A customer who starts again meets B8 once the webhook has made the first order open; before that, nothing stops a second payment. |

---

## 6. Payment

| ID | Situation | What happens |
|---|---|---|
| P1 | Card declined / insufficient funds | Stripe's message under the form. The same order and PaymentIntent are reused for the next try. No application. |
| P2 | Card needs a redirect (3-D Secure, some wallets) | Returns to `/deregister/bestaetigung?auftrag=…`. If `redirect_status` is not `failed` it shows "Ihr Antrag ist eingegangen" for any well-formed reference, without checking payment [GAP]. |
| P3 | 3-D Secure failed or abandoned | "Zahlung nicht abgeschlossen. Es wurde nichts abgebucht." + "Erneut versuchen" → restart at step 0 (new order). |
| P4 | Customer never pays, or goes back and edits after a failed try | An `awaiting_payment` row and an open PaymentIntent stay for ever. No link exists for it. Nothing is deleted [OPEN Q22]. |
| P5 | Tab closed after paying | No effect: the webhook, not the browser, starts everything. |
| P6 | Webhook unsigned / wrongly signed | 400, Stripe doesn't retry. Events other than `amount_capturable_updated` / `succeeded`, or a PaymentIntent without `order_id`, are ignored (200). A repeat is a no-op. Any failure inside is a 500, so Stripe retries. Retry resumes with the token it already issued. |
| P7 | Payment not yet held/captured when the event is handled | Nothing happens. |
| P8 | Email 1 cannot be sent | Nothing is recorded; 500; Stripe retries. If it never works the order stays `awaiting_payment`, the hold lapses in 7 days, the customer is charged nothing and told nothing [OPEN Q33]. |
| P9 | Webhook never delivered | Same dead end. The poller doesn't look at `awaiting_payment` and "resend link" refuses it [GAP]. |
| P10 | SEPA Direct Debit | Not offered (cards, Apple Pay, Google Pay only). `payment_failed` isn't subscribed; the customer sees the failure in the form [OPEN Q12]. |
| P11 | Email typed wrong | The link goes to a stranger, who can open the status page (plate, last 4 of the FIN, documents). The customer has no recovery: resend only mails the stored address [OPEN Q25]. |

---

## 7. Filing at Zulex

Runs inline after payment (H1 step 8) and, when it did not finish, from the poller.

| ID | Situation | What happens |
|---|---|---|
| S1 | `201` | As H1 step 8. |
| S2 | **`400` on the first try** | Zulex holds nothing. Straight to **5b** ("rejected"), card untouched, email 5b. |
| S3 | Timeout (15 s), 429, 5xx, 409, 401/403/404, unreadable answer | **Not** an error to the customer. Resubmitted silently under the same key at +1, 2, 5, 10, 30 min, then hourly (longer if `Retry-After` says so). Customer sees only step 1; no email; no refund. **Needs the cron** [OPEN Q23]. |
| S4 | `400` on a *retry* | Treated as one more unconfirmed try: it proves nothing about the first attempt. |
| S5 | 24 h since payment without a confirmed filing | **5c, full refund** (hold released, or captured money refunded); emails 5c (no fee named) and 6; a log line asks support to check the Zulex portal for a stray application [OPEN Q9, Q23, Q40]. |
| S6 | Money already went back before filing | Never filed; ends as S5. |
| S7 | Filed, but capture / email 4 / save fails afterwards | The Zulex id is saved first, so it is never filed twice. Retried with backoff (a minute, then the online table). Email 4 may be late. |
| S8 | Stripe refuses the `application_id` tag | Logged, ignored. |

---

## 8. At the KBA

| ID | Situation | What happens |
|---|---|---|
| K1 | Still in progress | Next check per the schedule (H1 step 10; H3 for hand-processed). |
| K2 | Zulex 429/5xx/timeout on a check | Status unchanged; waits `Retry-After` or the schedule. Other errors (401, 404, unreadable) also back off but are logged as failing every time. Customer sees nothing. |
| K3 | Unknown status tag, or never finishes | Treated as in progress, polled hourly/daily for ever. Customer keeps seeing "KBA bearbeitet". No stuck-order alert [NOT BUILT, M8]. |
| K4 | `FINISHED` with a confirmation | **5a.** Rejection documents alongside it are stored too. |
| K5 | `FINISHED` with only a `REJECTION` document | **5b** ("rejectionDocument"). |
| K6 | `FINISHED` with no documents | **5a** with an empty download area ("… sobald sie vorliegt"). The order is terminal and never revisited, so the PDF never arrives [GAP, OPEN Q28]. |
| K7 | `ERROR` with a code | Catalogue is empty, so every code is "technical": **one** silent `POST /applications/{id}/retry`, nothing sent or refunded. A second `ERROR` → **5b** with a log warning to add the code. (If the catalogue marks a code *final* → 5c, fee kept; *correctable* → 5b without retry.) A missing `errorInfo` reads as code 0. The one retry is per filing; a corrected resubmission gets its own [OPEN Q9, Q10, Q18]. |
| K8 | Documents can't be stored on completion | The step fails and repeats every tick; the customer stays at step 4 until it works. |
| K9 | Card at completion | Held → captured in full. Already captured → nothing. **Hold already lapsed** → order completes, nothing collected, loss is ours, log line names it [OPEN Q20]. |

---

## 9. 5b — correction required

**Entered from** S2 (400), K5 (rejection document), K7 (second `ERROR`). The customer sees a red outcome step, the reason (today always "Die Zulassungsstelle konnte den Antrag mit diesen Angaben nicht bearbeiten." [PLACEHOLDER, Q10]) and email 5b. Card: still held after S2; already captured after K5/K7 for an online authority.

The customer chooses one of three things.

**A. Correct and resubmit** — free [OPEN Q11]; VIN and the three codes only, not the plate [OPEN Q26]; the form starts empty and blank fields stay as they were; at least one change is required.

| Case | Result |
|---|---|
| Zulex holds the application (K5, K7) | `PATCH` with only the changed fields (skipped if Zulex is already working on it) → status 4, poll restarts, **email 4 again** (best effort). |
| Zulex refused it outright (S2) | Refiled under a **new idempotency key** → status 1 → filing as §7 → status 4, or back at 5b with email 5b again [OPEN Q37]. |
| Zulex refuses the `PATCH` (400) | "Der Antrag wurde mit diesen Angaben erneut nicht angenommen …"; order unchanged. |
| Zulex unreachable | "… nicht erreichbar … Ihre Angaben sind nicht verloren"; order unchanged. (On a refile it is accepted and the poller files it.) |
| Field wrong / nothing changed | Message at the field; nothing sent. |
| Part of the money already went back (half-done cancel, lapsed hold) | Form replaced by "Stornierung begonnen … bitte abschließen"; only cancel remains. |
| Link invalid, or order no longer at 5b | Page refreshes to show where the order stands. |

**B. Cancel** — dialog names the fee and refund. Money moves first, then email 6, then the status.
- Held card → capture 19.99 € only (Stripe releases the rest) [OPEN Q8].
- Captured card → refund total − 19.99 € (50.00 €).
- Status `cancelled`; polling stops; email 6 with the returned amount.
- A failure part-way leaves the order at 5b; asking again finishes it without moving money twice. Double clicks are safe.

**C. Do nothing** — the order waits for ever [OPEN Q21]. A daily check captures the card before a hold can lapse, then stops looking. Nothing tells the customer.

Correct, cancel and the poller claim the order with a version-checked write, so whichever loses fails first and can be retried. Correct and cancel share **10 attempts per hour per address**.

---

## 10. 5c — rejected, refund

**Reachable today only through S5/S6** (24 h unconfirmed filing → full refund, no fee kept).

The fee-keeping 5c (a KBA code the catalogue marks final: refund total − 19.99 €, emails 5c then 6) is built and tested but has no trigger until the catalogue has entries [OPEN Q10]. 5c on failed identity verification does not exist [NOT BUILT, Q1–Q4].

Customer sees "Antrag abgelehnt", the reason, "Eine Korrektur ist nicht möglich", the exact refund read live from Stripe ("… in 3 bis 5 Werktagen") and "Neuen Antrag stellen" (`/deregister`). If Stripe cannot say (for example staging's seeded orders), the page points to the email.

---

## 11. Around every outcome

| ID | Situation | What happens |
|---|---|---|
| A1 | Guessed or wrong link | Same "Link nicht gültig" page whether or not a link ever existed, with a resend link. Tokens are 256-bit. Every lookup counts: 60 per minute per address; over it the page says "Zu viele Anfragen" and re-checks itself. |
| A2 | Lost link | `/status/link-anfordern`: reference + email. For a well-formed pair the answer is always the same and instant (a malformed one gets field errors, a caller over the limit is told to wait). Only if the pair matches a paid order is a **new link mailed and the old one killed**. Limits: 5 per hour per address, 3 per hour per order. Anyone who knows a reference can burn its 3 requests [OPEN Q34, Q25]. |
| A3 | Download | Only for that link's order; 20 per minute per address; every miss is an empty 404; a PDF is recognised by its first bytes, anything else is sent as `octet-stream`. Unknown document kinds are labelled "Dokument". Storage down → the page still renders, without downloads. |
| A4 | Withdrawal (Widerruf) | No path in the app. The customer can cancel only at 5b. While at the KBA or after completion there is nothing to press; the only contact is `kontakt@gm-gastro.com`, and no process behind it exists in the code [OPEN Q13, Q27]. |
| A5 | Email 6 | Sent once per order when the refund or hold release is *accepted* by Stripe, not on Stripe's `charge.refunded` [OPEN Q35]. Not sent when nothing goes back. |

---

## 12. Money per path

Price is a placeholder: 69.99 € = 50.00 € + 19.99 € fee.

| Path | Card at that moment | Customer ends up paying | Stripe action | Email 6 |
|---|---|---|---|---|
| Completed, online authority | captured at filing | 69.99 € | capture full | no |
| Completed, hand-processed | held → captured ≤ 48 h before lapse, or at completion | 69.99 € | capture full | no |
| 5b cancel, card still held (S2, hand-processed) | held | 19.99 € | capture 19.99 €, rest auto-released | yes, 50.00 € |
| 5b cancel, card captured | captured | 19.99 € | refund 50.00 € | yes, 50.00 € |
| 5c fee-keeping [unreachable today] | either | 19.99 € | as the two rows above | yes |
| 5c after 24 h unconfirmed (S5) | held / captured | 0 € | release / refund 69.99 € | yes, 69.99 € |
| Hold lapsed, then completed | released | 0 € (loss ours) | none | no |
| Hold lapsed, then failed | released | 0 € | none | yes, 69.99 € |
| Correction | unchanged | no extra | none | no |
| Payment declined / abandoned | none | 0 € | none | no |

---

## 13. Emails

| # | Template | Sent when | Notes |
|---|---|---|---|
| 1 | `orderConfirmation` | payment confirmed | before status 1 is saved |
| 4 | `submittedToKba` | Zulex accepts; again after each correction that goes back to the KBA | wording differs online / hand-processed |
| 5a | `completed` | KBA finished | links to the page; the PDF is not attached [OPEN Q29] |
| 5b | `correctionRequired` | entering 5b, again after a failed refile | reason + correct link + cancel/fee note |
| 5c | `rejected` | entering 5c | reason, refund, fee if any |
| 6 | `refundIssued` | see A5 | |
| — | `statusLinkResent` | A2 | |
| 2, 3 | Verimi | — | [NOT BUILT] |

**Never emailed:** the silent retry, the silent resubmission, a refused correction, a poll that changed nothing, a payment failure. No email carries a security code.

**Delivery:** an email goes out *before* its status is saved, so an address the mailer keeps refusing holds the order at its old status and retries every tick, with no limit and (except email 4) no backoff; a held card may lapse meanwhile [OPEN Q33]. Staging drops non-allowlisted recipients silently (logged). All German wording is ours and unreviewed [OPEN Q31].

---

## 14. Docs and copy that disagree with the code

| Where | Says | Code does |
|---|---|---|
| Landing trust strip (`trust-strip.tsx`) | "Abbuchung erst mit dem Ergebnis" | Card is charged at filing (online) or ≤ 48 h before the hold lapses. Commit `5287b7f` fixed three other texts and missed this one [GAP]. |
| `/datenschutz` | "Sicherheitscodes werden nicht dauerhaft gespeichert"; collects name, address, phone | Codes are stored encrypted and never deleted [OPEN Q22]. No name, address or phone is collected [GAP, D8]. |
| Landing service card | "ab 29,00 €", "Endpreis" | Checkout charges 69,99 € [OPEN Q19]. |
| FAQ "Wie lange …" | "meist innerhalb eines Werktages" | Funnel and email 4 say "wenigen Minuten bis Stunden". |
| FAQ "abgelehnt" | "klären wir die Korrektur mit Ihnen" | Correction is self-service on the status page. |
| `docs/site-contract.md` §2.4 | Payment Element with SEPA | Cards only [OPEN Q12]. |
| `docs/deregistration-user-journeys.md` J1, J5 | Statuses 2–3 in the happy path; 5c "minus 19.99 €" | Verimi not built; that 5c is unreachable (§1 #3, #6). |
| Launch plan M6 exit criterion | email 6 "only after `charge.refunded`" | Sent when Stripe accepts the refund [OPEN Q35]. |

---

## 15. Registers

### Open questions and what the code does meanwhile

Each is in [launch-plan.md](launch-plan.md) with "if the founder answers differently" pointers.

| Q | Question | Code today |
|---|---|---|
| 1–4 | Verimi: who integrates, who sends the link, how we learn the result, is it needed | Not in the flow; port + fake exist unused; 1 → 4 |
| 5 | When is Zulex called | Right after payment |
| 7 | When is a held card captured | Online: at filing. Hand-processed: at completion or ≤ 48 h before lapse |
| 8 | How to keep 19.99 € from a held card | Capture 19.99 € only |
| 9 | "Our side" vs "API" technical error | 24 h unconfirmed = ours (full refund); unknown KBA code → 1 retry, then 5b |
| 10 | Zulex error-code catalogue (which are correctable/final) | Empty |
| 11 | Can a correction cost more | No |
| 12 | SEPA timing | Not offered |
| 13 | Withdrawal vs fee | Two consent boxes, nothing else |
| 14 | Verimi deadline | — |
| 17 | Processing-time wording | Two fixed sentences |
| 18 | Retry a data rejection | No (400 and rejection document skip the retry) |
| 19 | Real price, VAT, invoice | 50.00 € + 19.99 € |
| 20 | Hold lapse | Capture ahead; a lapse ends the order with nothing kept |
| 21 | 5b deadline | None; waits for ever |
| 22 | Retention | Nothing deleted; link never expires |
| 23 | Zulex behaviour (idempotency replay, rejection shape, special plates, cost, availability) | Assumed: replay returns the same id; both rejection shapes handled; 15 s timeout |
| 24 | May a non-keeper order | Yes; no applicant data |
| 25 | Mistyped email | No recovery |
| 26 | Correction scope | VIN + codes |
| 27 | Who receives alerts | Log lines only |
| 28 | Which documents to show | All, stored only at completion |
| 29 | Attach the PDF | No |
| 30 | "Steuer und Versicherung enden automatisch" | Shown on the status page |
| 31 | German wording sign-off | Unreviewed |
| 33 | Address that can't receive mail | Waits for ever |
| 34 | Resend kills old link | Yes |
| 35 | When email 6 goes | When Stripe accepts the refund |
| 36 | Own record of the money | Stripe only; DB columns stay empty |
| 37 | Correcting a refused order | Refile under a new key |
| 38 | Duplicate order | Warn, continue with a checkbox |
| 39 | Special plates | Warn, continue |
| 40 | Stray application after 24 h | Log line only |

### Placeholders

| Item | Where |
|---|---|
| Price 50.00 € (and 29/99/89 € "ab" prices on the disabled cards) | `src/core/domain/pricing.ts`, `service-selection.tsx` |
| Empty rejection catalogue; one general reason | `rejection-catalogue.ts` |
| "AGB: In Vorbereitung"; Datenschutz and Impressum not lawyer-reviewed | `app/(marketing)/*` |
| Code-locator photos: grey box "Foto: wo der Code steht" | `code-field.tsx` |
| Plate lettering: Kanit fallback until Euro Plate is licensed | `globals.css` |
| One support address `kontakt@gm-gastro.com` | `contact.ts` |
| Seeded demo orders and links | `db/seed/` |
| "Testmodus" simulated payment | dev only |

### Needs provisioning or outside work

| Item | Blocks |
|---|---|
| Cron entry + Vercel plan for per-minute cron | everything after status 4 |
| Zulex integration key (per-stage?), status-webhook request, production key, API availability | any real filing |
| Zulex error-code catalogue (founder chasing) | 5b/5c split, reasons |
| Lawyer texts: AGB, fee clause, withdrawal, Impressum, Datenschutz | taking money |
| Stripe live account KYC; production webhook; Apple Pay domain per stage | production payments |
| Staging Stripe webhook is subscribed to 2 events only (`charge.refunded` would need adding for Q35) | — |
| Resend: domain `mail.gm-gastro.com` verified, production key | any real email |
| Supabase production project; staging storage key and `STORAGE_DRIVER` flip (`provisioning.md` §9) | production data; documents on staging |
| Vercel `zulexgo` project variables, domain, DNS (SPF/DKIM/DMARC) | production |
| Verimi contract and credentials (only if Q4 says it is needed) | statuses 2–3 |
| Euro Plate licence, locator photos, brand colour sign-off | design finish |
| An alert channel and someone with Zulex portal access | Q27, Q40 |

### Not built

Verimi and emails 2–3 · poller schedule · Zulex status webhook route · 5b auto-cancel deadline · consent storage (D9) · retention / deletion and `audit_log` · CSP and rate limits on eligibility and checkout (M7) · monitoring, stuck-order alerts, runbooks (M8) · beta gate / invite codes (M9) · withdrawal handling · SEPA · English UI · own copy of captured/refunded amounts.

---

## 16. What only staging or production can confirm

- Real Zulex behaviour: error bodies, whether a replayed idempotency key returns the same `applicationId`, rejection as `ERROR` vs `FINISHED` + `REJECTION`, real `errorInfo` codes, `PATCH` and `retry` semantics, document content, 429 behaviour.
- Stripe: a partial capture releases the remainder and that remainder is not counted as refunded (`payment/stripe/map.ts` assumes it); `capture_before` on real cards; refund timing.
- Migrations `0006` and `0007` applying on the staging deploy.
- Anything needing the poller (nothing schedules it): hold checks, the daily 5b look, the 24 h resubmission, status changes after step 4.
- How the emails render in real clients; that Resend shows the domain as verified.
