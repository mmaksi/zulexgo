# ZulexGO — MVP Production Launch Plan

## Context

ZulexGO: B2C web app for online vehicle de-registration (Außerbetriebsetzung) on the B2B Zulex API. **M0 and M1 are done.** The repo has the marketing layer (landing, legal placeholder pages, design tokens, Shadcn in `src/ui`, Jest + msw) with colocated tests, plus the foundation:
- **Config layer:** zod-validated env in `src/config/env.ts`, selected by `APP_ENV`; five driver variables and stage guardrails as tests; composition root `src/config/container.ts`; `.env.example` committed.
- **First ports:** `Clock` and `TokenGenerator`, each with a contract suite passed by real and fake adapter.
- **CI:** `.github/workflows/ci.yml` runs lint, typecheck, tests, build on every PR, plus the `main accepts staging only` check. ESLint boundary rule in place; a canary test proves the Zulex key never reaches the client bundle.
- **Deployment:** GitHub remote with protected `staging` and `main`, one Vercel project per branch, baseline security headers in `next.config.ts`.

Not built yet (M2 onward): domain core beyond those two ports, vendor adapters, database, funnel, status page.

Project rules (`CLAUDE.md` + `.claude/skills/`) govern *how* each arrives: test-first for domain rules, interactive behaviour, security invariants, integration boundaries and bug fixes (no tests for static presentation, tokens, or configuration); ports-and-adapters with contract tests and an in-memory fake per port; `APP_ENV`-driven stages; raw-SQL migration folders; "nothing reaches production that has not run on staging."

Milestones are dependency-ordered from current state to public launch. Per your answers: **no sizing or dates — ordering and exit criteria only**; **hosting is Vercel + Supabase**. Assumptions marked **[plan assumption]**; ambiguity under **Open questions (business logic v1.0)**.

- **Seven customer statuses, one automated email each:** 1 application submitted & payment received → 2 waiting for identity verification (Verimi link by email; selfie + ID-card scan, ~90 s) → 3 identity verification completed → 4 submitted to KBA, processing → 5a completed | 5b failed, correction possible | 5c failed, correction not possible. Separate refund email (template 6) when a refund is issued.
- **KBA submission follows identity verification:** step 3 = "the application can now be submitted to the KBA", step 4 = the transmission. At step 1 the application is "handed over to the Zulex API". Mapping of those two hand-overs onto Zulex API calls is open (Q1–Q3).
- **Internal (system-side) status labels:** 1 "Payment captured" · 2 "Waiting for customer" · 3 "Forwarding to KBA" · 4 "KBA processing" · 5a "Process completed" · 5b "Correction required" · 5c "Partial refund". Customer-facing step titles are the numbered statuses above.
- **Error algorithm, in order:** technical error retried automatically **once**, silently → success → 5a; else classify correctable (5b) or non-correctable (5c). Core principle: the second automatic attempt **always** precedes customer notification or refund. Retry for non-technical rejections: Q18.
- **5b:** customer corrects and resubmits (pays only the difference, if additional costs arise) or cancels (19.99 € processing fee retained, remainder refunded).
- **5c:** completely new application required; partial refund of amount minus 19.99 €. Failed identity verification is a 5c cause.
- **Technical error on our side:** full refund. **Resubmitting after cancellation:** new order, new PaymentIntent, full price.
- **19.99 € processing fee:** fixed regardless of service type; covers internal costs (Zulex API fee and administration). Cancellation option and fee must be communicated clearly **before paying**: in the T&Cs and as a checkout note.

---

## Critical path

```
M0 Repo hygiene & remote
 → M1 Config layer, composition root, boundary lint, CI, staging pipeline
 → M2 Domain core + all ports with fakes (status machine)
 → M3 Supabase Postgres, migration runner, schema, seed
 → M4 WALKING SKELETON — real Zulex (integration env) + Stripe (test) + Mailer on staging,
      minimal funnel + status link + minimal status page
      (identity verification faked until Q1–Q3 are answered)
 → M5 Full status dashboard, all eight emails, documents, resend-link, Verimi step
 → M6 Error algorithm, correction & cancel options, refunds, capture/hold policy
 → M7 Legal content, security & privacy hardening
 → M8 Operational readiness & production provisioning
 → M9 Beta (invite-gated, real vehicles) → public launch
```

Off the critical path (started M0, landing M7/M8): legal texts (lawyer, incl. the 19.99 € cancellation-fee clause), Stripe live activation (KYC; SEPA Direct Debit, Apple Pay, Google Pay enabled), Zulex production API key, **Verimi integration route (Q1–Q3)**, **status-change webhook from the Zulex API team** (see poller decision), domain + mail-domain authentication, Euro Plate web licence, brand sign-off on semantic colours, the Zulex error-code catalogue the founder is chasing.

Funnel UI (M4 Track B) starts once M2's fakes exist, parallel to M3.

---

## Default technical decisions (overridable; none blocks a milestone)

| Decision | Default | Why |
|---|---|---|
| Hosting | **Vercel**, two projects on two permanent branches: `zulexgo-staging` deploys `staging` (`APP_ENV=staging`), `zulexgo` deploys `main` (`APP_ENV=production`) | Separate projects = hard secret separation, required by `environments` ("secrets must not work across stages"). Public repo so branch protection is free: no direct push to either branch, CI required on both, `main` accepts PRs from `staging` only — the forge, not habit, enforces "nothing reaches production that has not run on staging". See `CONTRIBUTING.md`. Vercel Cron drives the poller; needs a plan tier allowing per-minute crons; commercial use requires Vercel Pro regardless. |
| Database | **Supabase Postgres**, Frankfurt (eu-central-1), one project per stage | EU residency for GDPR. **Server-side only** via Supavisor pooler (transaction mode) from Vercel functions; migrations use the direct connection. No Supabase Auth (no accounts by design), no client-side Supabase SDK, no RLS-based access — the app is the only client. |
| Postgres driver | `pg` (node-postgres) behind the `ApplicationRepository` adapter | No ORM; raw-SQL migrations stay the single source of truth. |
| Migration runner | **Small in-repo runner** (TDD'd) reading `db/migrations/NNNN_slug/{up,down}.sql`, recording version + checksum in `schema_migrations`, one transaction per migration | Supabase CLI migrations are flat, timestamped, up-only — incompatible with the skill's folder-with-`down.sql` rule. Owning ~100 lines beats amending the skill. Override: adopt Supabase CLI and amend `database-migrations`. |
| Document cache | **Supabase Storage**, private bucket, server-side only, signed URLs never exposed — app streams the PDF after token validation | Keeps official confirmations out of Postgres rows and behind the dashboard's token check. |
| Status updates from Zulex | **Per-application polling with backoff, driven by a Vercel Cron heartbeat.** Cron hits `app/api/internal/poll/route.ts` every minute with bearer `CRON_SECRET`; only rows with due `next_poll_at` are fetched — the API is *not* swept every minute. Default schedule: authority `online` → 1, 2, 5, 10, 30 min, then hourly; `unavailable`/`offline` (manual processing) → every 6 h, then daily; any `Retry-After` overrides; terminal states stop polling. ~10–30 GETs per application over its life. | Zulex API has no application-status webhook — spec only says in prose that a `noticeId` arrives "via webhook", with no registration or payload contract. Polling is the only way to catch a transition when nobody views the status page, and every change requires an email. **Better alternative, pursued in parallel:** ask the Zulex API team for a signed status-change webhook (`applicationId`, new `status`, `documents`). If it lands, `app/api/webhooks/zulex/route.ts` (signature-verified) triggers `advance-status` immediately and the poller drops to a slow hourly reconciler for missed deliveries — never removed, since a lost webhook otherwise means a customer never emailed. A queue service (Inngest/QStash) would replace the cron with per-application delayed jobs; fair choice but adds a vendor for no gain at MVP volume. |
| Transactional mail | **Resend** (EU data-processing terms confirmed at sign-up) | Simplest API and domain auth; `Mailer` port + contract suite make Postmark/Brevo a one-folder swap if EU posture requires. Business-logic document: Resend free up to 3,000 emails/month. At up to eight emails per order ≈ 375 orders/month, so M8 watches volume against the tier. |
| Payment | **Stripe Payment Element**: card (Visa, Mastercard), SEPA Direct Debit, Apple Pay, Google Pay; PaymentIntent created at checkout; **manual capture**, the document's preferred option "if technically feasible" — otherwise the document's default, automatic capture. Stripe has no manual capture for SEPA Direct Debit (verified in Stripe's docs), so capture is set per payment method: `payment_method_options[card][capture_method]=manual` holds cards, SEPA Direct Debit captured automatically. A single PaymentIntent with top-level `capture_method=manual` cannot offer card and SEPA together (Q12). No custom card processing — Payment Element keeps ZulexGO PCI-DSS compliant without separate certification. Refunds only via Refunds API, never by hand in the Stripe dashboard. Webhooks `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, each signature-verified. Metadata `order_id`, `service_type`, `customer_email`, `application_id`. ZulexGO stores only Stripe Customer ID and PaymentIntent ID, never payment data | All fixed by business-logic document §4. Manual capture conflicts with two other requirements in that section — Q6, Q7. Stripe facts here and in Q6–Q8, Q12 checked against Stripe's documentation. |
| Encryption of codes at rest | Application-level AES-GCM in the Postgres adapter, key from env (rotatable), from migration `0001` onward | Key stays off the DB host; in-memory fake stays plaintext; no later data migration. |
| Icon library | **lucide** (installed, Shadcn default), `ChevronRight` as bullet. **Settled in M0:** `docs/design-standard.md` §5.5 amended from Font Awesome to lucide, deviation from the print style guide recorded in that section. | One library, not two. Shadcn writes lucide imports into every generated component, so a second set is hand-maintained. Font Awesome trialled in M0 and reverted for that reason; it is also not a Shadcn `iconLibrary` value (`lucide`, `tabler`, `hugeicons`, `phosphor`, `remixicon`), so the CLI couldn't target it. Icons are decorative, no brand mark, so no brand sign-off outstanding. |
| Refund policy | **Fixed by business-logic document §3:** success → full capture, no refund · correct & resubmit → charge the difference only, if any · cancel at 5b → refund minus 19.99 € · non-correctable (5c) → refund minus 19.99 € · technical error on our side → 100 % refund · resubmit after cancel → new order, new PaymentIntent, full price. 19.99 € lives in `src/config/pricing.ts` as one constant. | Not a plan decision. Executing "refund minus 19.99 €" on an only-authorised payment is Q8. |
| Price display (PAngV) | **[plan assumption]** One all-inclusive price per plate count incl. authority fee, from `src/config/pricing.ts`; reconciled monthly against `FEE` documents | Document names no service price. API reports fees only after the fact; customer needs the total before paying. |

---

## Milestones

### M0 — Repo hygiene and remote

**Goal:** Repo safe for secrets and collaborators before either exists.

**Why first:** `.gitignore` lacks `.env*`, so the first `.env.local` would be committable; `.claude/` and `docs/` are gitignored, hiding the rules from CI and collaborators; no remote, so the PR workflow in `.claude/commands/commit-push-pr.md` can't run.

**How (high level):**
- `.gitignore`: add `.env*` with `!.env.example`; stop ignoring `/docs` and `/.claude` (keep `.claude/settings.local.json` ignored).
- Create GitHub remote; protect `main` (PRs only, CI required once M1 exists). Push.
- `package.json`: rename `my-app` → `zulexgo`; add `typecheck` (`tsc --noEmit`).
- Shadcn layout conflict: `components/ui` + `lib/` at root vs `project-structure`'s `src/ui` + `src/lib`. Default: move them, repoint `components.json` aliases (tests move too). Override: amend the skill.
- Kick off every external lead-time item (no code): lawyer for AGB/Impressum/Datenschutz, Stripe business verification, Zulex production key + integration credentials, **status-change webhook request to the Zulex API team**, domain purchase, Euro Plate licence enquiry, brand sign-off requests, error-code catalogue follow-up.

**Exit criteria:** fresh clone → `npm ci && npm run lint && npm run typecheck && npm test` green; `git check-ignore .env.local` succeeds and `git check-ignore docs/prd.md` fails; remote exists.

**Tests:** none — configuration only, outside the test-first rule per `CLAUDE.md`.

---

### M1 — Config layer, composition root, boundary lint, CI, staging pipeline

**Goal:** Later milestones can add an env var, adapter, and guardrail the prescribed way; every push is verified and deployable to a real staging URL.

**Why here:** `environments` needs zod-validated `APP_ENV` read once in `src/config/`; `external-services` needs `src/config/container.ts` and the `no-restricted-imports` rule *before* the first vendor adapter; TDD only matters once CI enforces it. Deploying the existing marketing site to staging proves the deploy path at zero risk.

**How:**
- Add `zod` as direct dependency. `src/config/env.ts` validates `APP_ENV`, `DATABASE_URL`, `DIRECT_DATABASE_URL`, `ZULEX_BASE_URL`, `ZULEX_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `MAIL_DRIVER`, `PAYMENT_DRIVER`, `REGISTRATION_DRIVER`, `REPOSITORY_DRIVER`, `STORAGE_DRIVER`, `MAIL_ALLOWLIST`, `APP_BASE_URL`, `CODES_ENCRYPTION_KEY`, `CRON_SECRET`, `SUPABASE_STORAGE_*`. Fails fast naming the missing variable.
- **Five driver variables, not three** (Deviation 5), plus a sixth, `IDENTITY_DRIVER`, in M5 for the Verimi step. Each names a port's adapter and gates that adapter's credentials:

  | Driver | Values | Gates | Flips to the real value in |
  |---|---|---|---|
  | `PAYMENT_DRIVER` | `fake` \| `stripe` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | M4 |
  | `REGISTRATION_DRIVER` | `fake` \| `zulex` | `ZULEX_BASE_URL`, `ZULEX_API_KEY` | M4 |
  | `MAIL_DRIVER` | `console` \| `resend` | `RESEND_API_KEY`; `MAIL_ALLOWLIST` on staging | M4 |
  | `REPOSITORY_DRIVER` | `fake` \| `postgres` | `DATABASE_URL`, `DIRECT_DATABASE_URL`, `CODES_ENCRYPTION_KEY` | M3 |
  | `STORAGE_DRIVER` | `fake` \| `supabase` | `SUPABASE_STORAGE_URL`, `SUPABASE_STORAGE_BUCKET`, `SUPABASE_STORAGE_SERVICE_KEY` | M5 |
  | `IDENTITY_DRIVER` | `fake` \| `verimi` | Verimi credentials — names pending Q1–Q3 | M5 |

  A variable is required **only when its driver is switched on**: `APP_ENV=dev` boots on fakes with no secrets; staging deploys in M1 before any vendor credential exists. Production rejects every fake value, so it cannot quietly run on one.
- Guardrails as tests: live Stripe key rejected unless production; test key rejected in production; production Zulex URL rejected unless production; production rejected on any fake driver; staging mail confined to `MAIL_ALLOWLIST`, which production forbids; no source file branches on `NODE_ENV`.
- `src/config/container.ts` — `createContainer(env)`. First two ports the full 7-step way (port → contract → fake → real → wire → lint): `Clock` and `TokenGenerator`, so the pattern exists before Stripe/Zulex.
- ESLint `no-restricted-imports` block from `external-services` in `eslint.config.mjs`.
- `.env.example` committed with every variable and a one-line comment.
- `.github/workflows/ci.yml`: `npm ci`, lint, typecheck, `jest --ci`, `next build` with placeholder staging env and a canary `ZULEX_API_KEY` that must not appear in `.next/static`. Second job, `main accepts staging only`, fails any PR into `main` whose source isn't `staging`. First required on both branches, second on `main` only.
- Vercel: two projects; `zulexgo-staging` auto-deploys `staging`, `zulexgo` auto-deploys `main` — branch protection is the gate, production has none of its own. Supabase: staging project provisioned (schema in M3).
- `next.config.ts`: baseline security headers (HSTS, `X-Content-Type-Options`, `Referrer-Policy`). CSP deferred to M7 once Stripe Elements' needs are known.

**Exit criteria:** CI required on `main` and `staging` and red on a deliberately failing test; staging URL serves the marketing page; a test proves `createContainer` with an `sk_live_` key and `APP_ENV=staging` throws; `tests/integration/client-bundle-secrets.test.ts` still passes.

---

### M2 — Domain core and all ports with in-memory fakes

**Goal:** Whole flow — checkout, identity verification, KBA submission, polling, error algorithm, status — runs end to end in memory, no vendor, network, or database.

**Why here:** Fakes let the funnel UI and use cases be built test-first while real adapters are written in parallel. The status machine is pure logic; must exist before M3 schema encodes it and M5 dashboard renders it.

**How:**
- `src/core/domain/`: `LicencePlate`, `SecurityCode` (3-char seal / 7-char certificate; `toString()` redacts), `Vin`, `Money`, `ApplicationReference` (`ZG-XXXXXX`), and **`ApplicationStatus`** — the seven customer statuses: `submitted_and_paid` (1) → `awaiting_identity_verification` (2) → `identity_verified` (3) → `submitted_to_kba` (4) → `completed` (5a) | `failed_correctable` (5b) | `failed_final` (5c), plus `cancelled` for the 5b cancel option. The one silent retry is an internal attempt counter on the application, not a customer status (customer not notified). Pure `advance(status, event)` with every transition tested; unknown Zulex status tag keeps `submitted_to_kba`. **Events for 1 → 2 and 2 → 3 undefined (Q1–Q3)**; modelled as abstract domain events so the machine doesn't depend on the answer.
- `src/core/domain/refund-policy.ts` — pure function from outcome to Stripe action and customer amount, one test per row of §3 table.
- `src/core/errors/`: domain errors (`ValidationError`, `GatewayRejected`, `GatewayUnavailable`, `PaymentDeclined`, `HoldExpired`, `TokenInvalid`, `IdentityVerificationFailed`…).
- `src/core/ports/`, each with a documented guarantee list and a `*.contract.ts` suite: `ApplicationRepository`, `RegistrationGateway`, `PaymentProvider`, `Mailer`, `DocumentStore`, `IdentityVerification` (+ `Clock`, `TokenGenerator` from M1). `IdentityVerification` gets port and fake here; real adapter waits for Q1–Q3.
- `src/adapters/*/fake/` — one in-memory fake per port passing its contract. Fake gateway scriptable (next status, next error, 429 + `Retry-After`) to drive J3–J6; fake payment provider models hold expiry via injected `Clock`; fake mailer records sends.
- `tests/fixtures/` + `tests/msw/` skeletons with obviously fake values (`AAA111`, `example.test`), validated by the adapters' zod schemas.
- Dev container: `APP_ENV=dev` → all fakes.

**Port order:** `ApplicationRepository` (use cases need it) → `RegistrationGateway` and `PaymentProvider` (skeleton) → `Mailer` (status link delivered only by email, so on the skeleton's path) → `IdentityVerification` (skeleton passes through its fake) → `DocumentStore`.

**Exit criteria:** every port has a contract suite and passing fake; one test per status transition; a test that `SecurityCode` never appears in `JSON.stringify` or `String()` output.

---

### M3 — Supabase Postgres, migration runner, schema, seed

**Goal:** Applications, payments, status history, tokens persist across requests in every stage; a developer sees every UI state right after `npm run db:seed`.

**Why here:** On Vercel nothing survives between checkout request, status-page visit, and poller tick — skeleton impossible without a real repository. Schema encodes M2's machine.

**How:**
- In-repo migration runner with `db:migrate`, `db:migrate:down`, `db:status`; CI runs up → down → up against a Postgres service container (the skill's rehearsal).
- `db/migrations/0001_create_applications` (encrypted codes, `idempotency_key` unique, `zulex_application_id`, `next_poll_at`, `poll_attempts`, `authority_ikfz_status`, `agb_version`, `consent_at` — consent columns now avoid an expand/contract cycle in M7 — `retry_attempts` for the one silent retry, `identity_verification_state`, status column covering all seven statuses plus `cancelled`), `0002_create_payments` (`stripe_customer_id`, `stripe_payment_intent_id`, captured and refunded amounts, retained fee — the only Stripe data stored), `0003_create_status_history`, `0004_create_status_tokens`. Each folder: `up.sql`, `down.sql`, `README.md`.
- `src/adapters/repository/postgres/` passing the `ApplicationRepository` contract against real local Postgres.
- `db/seed/seed.ts`: idempotent, deterministic, refuses unless `APP_ENV=dev` (guardrail test); ≥1 application per `ApplicationStatus` value — coverage test iterates the enum, so the M5 dashboard cannot render a state the seed lacks.
- Staging Supabase migrated in the deploy step; never seeded (guardrail test). Staging and production flip `REPOSITORY_DRIVER=postgres`, making `DATABASE_URL`, `DIRECT_DATABASE_URL`, `CODES_ENCRYPTION_KEY` required at boot.

**Exit criteria:** CI migration rehearsal green; Postgres adapter passes the same contract file as the fake; enum-coverage seed test green; `APP_ENV=staging npm run db:seed` exits non-zero.

---

### M4 — Walking skeleton on staging

**Goal:** One real test-mode de-registration on staging: Stripe test card authorised → signed Stripe webhook starts the application → order-confirmation email with status link delivered to an allowlisted address → identity verification passes through the fake adapter → application created at `https://integration-zulex.de/zulex-api/v1` → poller advances status → status page shows current step.

**Why here (the skeleton boundary):** earliest point exercising all irreducible unknowns together — real Zulex integration-env behaviour (error bodies, whether it reaches `FINISHED`, 429 behaviour), Stripe manual capture, email deliverability, polling on serverless. Everything before M4 is the minimum to run it; everything after is hardening or scope.

**Track A — adapters and use cases:**
- Time-boxed **read-only spike** against the integration env (throwaway, untested, never production code): capture real shapes for create/get/patch, `/registration-authorities`, `/documents/{id}`, an induced 400 and a 429. Scrub → `tests/fixtures/zulex/`; findings → `docs/deregistration-user-journeys.md`; delete spike code.
- `src/adapters/registration/zulex/`: zod response schemas, `X-Idempotency-Key` always sent, `X-Api-Key` from env, `Retry-After` honoured, unknown tags → in progress, vendor errors → domain errors. Passes contract via msw handlers built from captured fixtures.
- `src/adapters/payment/stripe/`: Payment Element with card, SEPA Direct Debit, Apple Pay, Google Pay; PaymentIntent at checkout, manual capture per payment method (`payment_method_options[card][capture_method]=manual`, SEPA automatic), metadata `order_id`, `service_type`, `customer_email`, `application_id` (last set once Zulex returns it); authorize / capture / release / full refund / partial refund, all idempotent on our ids; hold expiry → domain error. Contract via stripe-mock/msw.
- `app/api/webhooks/stripe/route.ts`: signing secret validated every call. `payment_intent.succeeded` → start application; `payment_intent.payment_failed` → show payment error; `charge.refunded` → refund email 6. Which event starts the application under manual capture: Q6.
- Only Stripe Customer ID and PaymentIntent ID persisted — a test asserts no other Stripe payment field reaches the repository.
- `src/adapters/mail/resend/`: passes `Mailer` contract via msw; **dev hard-blocks sending; staging enforces `MAIL_ALLOWLIST`** (tests for both). Two templates for now: email 1 (order confirmation, order ID, status link) and a generic status change.
- Add each SDK to `no-restricted-imports` in the same change as its adapter.
- Use cases: `check-eligibility` (prefix → `ikfzStatus` → processing-time expectation), `submit-checkout` (persist encrypted → create PaymentIntent → confirm in Payment Element), `start-application` (from Stripe webhook: status 1 → issue token → email 1 → hand over to identity verification), `submit-to-kba` (on identity verified: create Zulex application with `X-Idempotency-Key` → status 4; technical error retried once silently, then to M6's error algorithm), `advance-status` (one GET per *due* row, reschedule with the decisions-section backoff table; never logs codes or tokens), `get-status-by-token`.
- `app/api/internal/poll/route.ts` behind `CRON_SECRET`; `vercel.json` cron every minute. Backoff schedule is a pure function (`nextPollAt(status, ikfzStatus, attempts, retryAfter, now)`) tested on every branch, so API load is a table, not behaviour scattered through the poller.
- If the Zulex webhook exists by now: `app/api/webhooks/zulex/route.ts`, signature-verified, replay-protected, calls `advance-status` for the one application; cron drops to reconciler cadence. Same use case, second trigger.
- Integration tests: `deregistration-checkout.test.ts` (checkout → webhook → status 1 → fake verification → status 4; unsigned webhook rejected), `status-polling.test.ts`, plus the required assertion that codes and tokens are absent from captured logs and rendered status HTML.

**Track B — minimal funnel and status page (starts after M2, parallel to M3):**
- `app/(funnel)/deregister/`: progress indicator; eligibility (plate count, documents check, prefix → availability notice); application form (plate, VIN, codes with contextual front code, email, locator-image placeholders); review & pay (masked summary, total price, T&Cs + right-of-withdrawal consent, **19.99 € processing-fee notice visible before the pay button**, Stripe Payment Element, sticky mobile CTA); confirmation (order ID, "your status link is on its way to {email}").
- `app/status/[token]/`: vehicle summary + read-only stepper from the domain enum; invalid token → neutral error page, no existence disclosure.
- Client validation shares zod schemas from `src/core/domain`. Plate rendered with existing `plate-text` fallback until Euro Plate is licensed.
- **Tested (per `CLAUDE.md`):** form validation and contextual front-code field, forward/back navigation with preserved state, CTA disabled until T&Cs and right-of-withdrawal consent ticked, processing-fee notice present before payment is possible (legal requirement, so behaviour, not copy), invalid-token error page, accessible names on every input. **Not tested:** progress indicator, confirmation copy, section frames, stepper visual states.

**Convergence:** staging container wired `REGISTRATION_DRIVER=zulex`, `PAYMENT_DRIVER=stripe`, `MAIL_DRIVER=resend`, identity verification still fake; run the scenario by hand with a Stripe test card and allowlisted inbox.

**Exit criteria:** on staging, one run yields an `applications` row with a Zulex `applicationId`, a test PaymentIntent with all four metadata keys, a delivered email 1, ≥1 poller-driven status transition, and a status page on the right step; the two integration flows + secrets-absent test pass in CI; boundary lint fails on a deliberate `import Stripe from 'stripe'` inside `src/core/`.

**Risks:** integration env may never reach `FINISHED` or return documents (then completed path proven via msw, confirmed in beta); spike may force port renames — do it day one; Stripe Elements CSP needs — noted for M7.

---

### M5 — Full status dashboard, notifications, documents, resend-link, identity verification

**Goal:** A paying customer follows every step by email and dashboard, verifies identity, and downloads the official confirmation when finished.

**How:**
- The eight emails of business-logic document §5, as reviewed HTML snapshots (the one snapshot case `CLAUDE.md` permits), with no security codes and no token beyond the status link:

  | # | Trigger | Subject | Content |
  |---|---|---|---|
  | 1 | After payment | Your ZulexGO application has been received | Confirmation, order ID, status link |
  | 2 | Verimi step | Please verify your identity | Verimi link, instructions, deadline |
  | 3 | Identity verified | Identity verification successful ✓ | Confirmation, next step |
  | 4 | Submitted to KBA | Your application is with the KBA | Status update, expected processing time |
  | 5a | Successful | Done! Your application is complete ✓ | Congratulations, documents |
  | 5b | Error – correctable | Your application requires a correction | Error reason, correction link, cancel option + fee notice |
  | 5c | Error – not correctable | Your application has been rejected | Rejection reason, refund info (minus 19.99 €) |
  | 6 | Refund | Your refund is on its way | Amount, timeframe (3–5 business days) |

  German wording is a translation task, not in the document. 5a's "plate shipping info" applies to registrations only; omitted for de-registration.
- **[plan assumption]** A "resend my link" email beyond the eight (see resend flow below); not in the document.
- **Verimi step (status 2 → 3):** real `IdentityVerification` adapter, email 2, the 2 → 3 transition. Shape depends entirely on Q1–Q3; can't be broken down further until answered.
- `src/adapters/storage/supabase/` — Supabase Storage cache of Zulex documents — passing the `DocumentStore` contract; `UNKNOWN` → "Dokument". Staging and production flip `STORAGE_DRIVER=supabase`, making `SUPABASE_STORAGE_*` required at boot.
- Dashboard: seven-step stepper with timestamps from `status_history`, each step showing the document's status line (e.g. "Waiting for customer" at step 2, "KBA processing" at step 4), outcome block (5a success + downloads / 5b reason + correct or cancel / 5c reason + refund info + start a new application), help block, **"Resend my link"** (email + reference → send to the *stored* address only; constant-time response; rate-limited; token rotated on resend), revalidation on focus/interval, stepper pulse while polling.
- Token lifecycle: ≥128-bit, revocable, rate-limited lookups.

**Exit criteria:** `status-notifications.test.ts` drives the fakes through every transition, asserting exactly one email per transition — none during the silent retry — with no code in any body; staging drops non-allowlisted recipients (test); a fixture document downloads through the token-guarded route.

---

### M6 — Error algorithm, correction and cancel options, refunds, hold policy

**Goal:** Every failure follows the document's algorithm — one silent automatic retry, then 5b or 5c — and every outcome produces exactly the Stripe action and customer amount in its §3 table.

**How:**
- **Error algorithm** (`src/core/domain/error-algorithm.ts`, pure): technical error (API timeout, KBA temporarily unavailable, Zulex `ERROR`) → exactly **one** automatic retry via `/applications/{id}/retry`, no customer notification, no refund → success → 5a → failure classified. Retry for non-technical rejection: Q18. Correctable (5b): wrong data the customer can fix, technical API error. Non-correctable (5c): wrong owner data, identity verification failed. Document's examples come from registration services (eVB number, plate availability, owner address); de-registration mapping is Q10.
- **5b, option A — correct and resubmit:** dashboard correction form → `PATCH` → back to status 4. Only a price difference is charged, as a separate PaymentIntent, only if one arises (Q11).
- **5b, option B — cancel:** from the dashboard or the correction link in email 5b; refund amount minus 19.99 €; status `cancelled`; email 6 on `charge.refunded`. Fee shown next to the cancel button.
- **5c:** refund minus 19.99 € → email 5c, then email 6; dashboard offers a new application (new order, new PaymentIntent, full price).
- **Technical error on our side:** 100 % refund. Boundary vs "technical API error → 5b" is Q9.
- All refunds triggered by code via the Refunds API; nothing by hand in the Stripe dashboard.
- Data-driven `src/core/domain/rejection-catalogue.ts` (Zulex error code → correctable | non-correctable, with German copy), fed by the founder's error-code catalogue.
- **[plan assumption]** Hold policy (J7): capture on Zulex `201` when `ikfzStatus=online`; otherwise hold and capture on `FINISHED`; if the hold nears expiry, email a re-authorisation request. Document says only "captured when the application is confirmed" (Q7).
- **[plan assumption]** J8: duplicate warning for same plate + VIN with an open application.
- **[plan assumption]** J11: special plates flagged "may be rejected" in eligibility until the provider clarifies.

**Exit criteria:** error-algorithm test proves exactly one retry, no customer email and no refund before classification; one test per §3 refund-table row asserting Stripe action and amount (e.g. refund = total − 19.99 €); refund idempotency test; a 5b cancel and a 5c each produce email 6 only after `charge.refunded`.

**Fallback if the error catalogue is still missing at launch:** **[plan assumption]** unrecognised error → correctable (5b), since the customer can still cancel there for the same 19.99 € lost at 5c; support alerted on every unrecognised code for reclassification. Catalogue update = data PR with a test.

---

### M7 — Legal content, security and privacy hardening

**Goal:** The service may legally take money from a German consumer and would pass a security review.

**Why here:** consent capture needs M3's columns and M4's checkout; CSP needs the final third-party script set; retention needs M5's terminal states.

**How:**
- Lawyer-reviewed AGB/Impressum/Datenschutz replace placeholders. AGB carry the 19.99 € processing-fee clause for cancellation and non-correctable failure, stating what it covers (Zulex API fee and administration); Datenschutz covers Verimi's processing of ID and selfie data. AGB version + right-of-withdrawal consent stored per application (tests: checkout impossible without them). Right of withdrawal vs 19.99 € fee: Q13.
- PAngV price from `src/config/pricing.ts`; VAT and authority fee itemised.
- `next.config.ts` CSP (Stripe domains), `frame-ancestors`, permissions policy — asserted in route tests.
- Rate limiting on status lookup, resend, eligibility, checkout (per IP + per token), with tests.
- Log-redaction layer + required test that codes/tokens never appear in logs; `audit_log` migration for status changes and refunds.
- Retention cron: purge security codes N days after a terminal state; anonymise after the statutory period; uses the `Clock` port.
- `/security-review` of the branch, `npm audit`, dependency pinning; short threat-model note (token brute force, IDOR on documents, webhook replay).
- Brand items: apply approved semantic colours; Euro Plate self-hosted WOFF2 if licensed, else the existing fallback ships (checked in the browser, not tested — presentation).

**Exit criteria:** legal pages contain reviewed text, no placeholder; consent-gate test; header tests; retention test; a rendered status page snapshot contains no 3- or 7-character code from fixtures.

---

### M8 — Operational readiness and production provisioning

**Goal:** Production exists, is observable and recoverable; the team answers "what do we do when X" from a runbook.

**How:**
- Production Vercel project + production Supabase (Frankfurt), `APP_ENV=production`, live Stripe keys, Zulex production key, `https://app.zulex.de/zulex-api/v1`. Deploy pipeline runs guardrail tests against each stage's real config (production rejects a test key; staging rejects the production URL).
- Domain, TLS, SPF/DKIM/DMARC for the mail domain.
- Monitoring: error tracking; uptime on `/` and the status route; poller-lag alert (`next_poll_at` overdue); Zulex-call-volume alert (GETs/hour above expected envelope = backoff broken); stuck-application alert (in `submitted_to_kba` beyond authority SLA); Stripe webhook failure alert; capture/refund anomaly alert; daily reconciliation (Stripe captures vs applications); monthly email volume vs Resend tier (3,000 free emails/month).
- `docs/runbooks/`: stuck application, failed refund (re-triggered via the app's own tooling — document forbids manual refunds in the Stripe dashboard), hold expiring, Zulex outage, key rotation (config change, no deploy), rollback incl. `down.sql` rehearsal on staging, restore from Supabase PITR.
- Backup drill: restore staging to a scratch project, verify migration status.
- Load/rate-limit rehearsal: poller under sustained 429 honours backoff; status endpoint under brute force returns 429 without timing leaks.
- Go/no-go checklist from PRD §6 success criteria + guardrails.

**Exit criteria:** production deploys only from `main`, which accepts only `staging` after the full suite ran on it; alerts fire in a drill; restore drill documented; checklist signed.

---

### M9 — Beta, then public launch

**Goal:** Real de-registrations by a known group succeed end to end in production before the public CTA goes live.

**How:**
- `LAUNCH_MODE=beta|public` in config: beta requires an invite code and caps daily applications; marketing CTA points to a waitlist.
- Founder + friends-and-family run real de-registrations: ≥1 online authority, ≥1 manual-processing authority, ≥1 single-plate vehicle.
- Watch M8 dashboards; fix bugs test-first; every hotfix through staging — no exceptions.
- Flip to `public`, remove the cap, announce.

**Exit criteria:** N beta applications with 100% status accuracy vs backend state; zero code/token exposure findings; ≥1 official confirmation PDF downloaded from production; a 5b cancellation exercised once deliberately, refund arriving as total minus 19.99 € and email 6 sent; then the gate flips.

---

## Blocked items and the fallback shipped if unresolved at launch

| Item | Plumbing lands in | Fallback |
|---|---|---|
| Zulex error-code catalogue | M6 | unknown → 5b + support alert |
| Verimi integration route (Q1–Q3) | M5 | none — status 2 → 3 cannot ship without it; blocks launch |
| Euro Plate web licence | M7 | existing `plate-text` Kanit fallback, checked in browser — not tested, presentation |
| Semantic colour sign-off | M7 | ship the derived palette already in `app/globals.css` |
| Icon library decision | resolved in M0 | lucide; §5.5 amended, no sign-off outstanding |
| Fee table / price | M7 | flat all-inclusive price per plate count, monthly reconciliation |
| Stripe live / Zulex production key | M8 | beta runs founder-owned vehicles first; public gate stays closed |
| Special plates (E/H/seasonal) | M6 | eligibility warns "may be rejected" |
| Zulex status-change webhook | M4 (route) | per-application polling with backoff is complete on its own; webhook only shortens latency |

## Deviations from skill rules (explicit)

1. **In-repo migration runner** instead of Supabase CLI migrations — CLI format incompatible with the skill's folder + `down.sql` layout.
2. **Shadcn files moved** from `components/`+`lib/` to `src/ui`+`src/lib` to satisfy `project-structure`; alternatively amend the skill.
3. **Design standard §5.5 amended** from Font Awesome to lucide — **done in M0**, not pending. Deviation and reasoning recorded inside §5.5 so it isn't later mistaken for drift.
4. **`.claude/` and `docs/` un-ignored** in M0 — `CLAUDE.md` calls them authoritative; CI and collaborators must see them.
5. **Five driver variables, not the three named in M1** — `REPOSITORY_DRIVER` and `STORAGE_DRIVER` added so "required only when switched on" has a switch for `DATABASE_URL` and `SUPABASE_STORAGE_*`. Otherwise: require a database URL on every deployed stage (blocking the M1 staging deploy until M3), or leave it optional forever (production could boot with no database). **Decided in M1.**
6. **`Clock` and `TokenGenerator` are real in every stage**, incl. dev, while every vendor port follows the skill's "fake in dev" rule. No driver variable: no network, money or secret to fake away, and a frozen clock or predictable status link in a running dev server is a bug, not a convenience. Their fakes exist for tests, as `external-services` rule 4 requires. **Decided in M1**; reasoning recorded in `src/config/container.ts`.
7. **Two permanent branches, `staging` and `main`, instead of promoting a build** — each has a Vercel project; branch protection enforces the path: no direct push to either, CI required on both, `main` accepts PRs from `staging` only. Repo is public because protected branches are paid on private ones. `enforce_admins` on for both; no approving review required (`docs/provisioning.md` §4). **Decided after M1.**
8. **`test-driven-development` skill vs `CLAUDE.md`:** skill said "Always" for every feature and listed configuration as an approval-needing exception; `CLAUDE.md` scopes test-first to logic, behaviour, boundaries and fixes, excluding presentation and configuration outright. `CLAUDE.md` wins as the project instruction. **Resolved:** the skill's "When to Use" section now mirrors `CLAUDE.md`.

## Critical files (to create or change)

- `.gitignore`, `package.json`, `components.json` — M0
- `src/config/env.ts`, `src/config/container.ts`, `eslint.config.mjs`, `.env.example`, `.github/workflows/ci.yml`, `CONTRIBUTING.md`, `next.config.ts` — M1
- `src/core/domain/application-status.ts` (the machine everything derives from), `src/core/ports/*.ts` + `*.contract.ts`, `src/adapters/*/fake/` — M2
- `db/migrations/0001_…0004_*`, `db/seed/seed.ts`, `src/adapters/repository/postgres/` — M3
- `src/adapters/{registration/zulex,payment/stripe,mail/resend}/`, `src/core/use-cases/*.ts`, `src/core/domain/poll-schedule.ts`, `app/(funnel)/deregister/`, `app/status/[token]/`, `app/api/internal/poll/route.ts`, `app/api/webhooks/stripe/route.ts`, `app/api/webhooks/zulex/route.ts` (if the webhook exists), `vercel.json`, `tests/integration/*.test.ts` — M4
- `src/adapters/identity/verimi/` (shape pending Q1–Q3) — M5
- `src/core/domain/error-algorithm.ts`, `src/core/domain/refund-policy.ts`, `src/core/domain/rejection-catalogue.ts` — M2/M6
- `docs/launch-plan.md` (this document), `docs/runbooks/` — M8

## Open questions (business logic v1.0)

Nothing below is decided here. Numbers are stable — milestones refer to them.

**Which answers are needed first:**

| Priority | Questions | Why |
|---|---|---|
| 1 — blocks the M4 walking skeleton | Q5, Q6 | M4 is critical-path; can't run end to end without knowing when Zulex is called and what starts the application. |
| 2 — blocks the status model in M2/M3 | Q1–Q4, Q7, Q8, Q9, Q18 | Status list, error algorithm and refund function are built in M2 and encoded in the M3 schema. |
| 3 — blocks launch, not the skeleton | Q10–Q16 | Needed for M5–M7; earlier work proceeds on fakes and placeholders. |
| 4 — non-blocking | Q17 | A placeholder processing time can ship and be replaced. |

**Identity verification (Verimi)**

1. **Who integrates Verimi?** ZulexGO calling Verimi directly, or the Zulex backend running the Verimi step? Zulex API spec has no Verimi field, endpoint or status.
   **Blocks:** M5 (Verimi adapter, `IDENTITY_DRIVER` credentials), M7 (privacy policy and data processing agreement).
2. **Who sends email 2 and where does the Verimi link come from?** Document lists it among emails ZulexGO sends via Resend, but ZulexGO can't create the link unless it integrates Verimi itself.
   **Blocks:** M5 (email 2).
3. **How does ZulexGO learn verification succeeded or failed?** Verimi callback, Zulex status, or polling? Zulex exposes only `IN_PROGRESS | FINISHED | ERROR`.
   **Blocks:** M2 (event behind the 2 → 3 transition; placeholder until answered), M5 (the transition itself), M6 ("identity verification failed → 5c").
4. **Does de-registration need Verimi at all?** De-registration request carries no owner data, and under i-Kfz the scratched security codes are the proof of possession. Several document examples (eVB, plate shipping, owner address) come from registration services.
   **Blocks:** M2 (seven or five statuses), M3 (status column), M5 (stepper, emails 2 and 3), M7 (whether the privacy policy covers ID and selfie data).
14. **Verimi deadline:** email 2 names a deadline. How long, is there a reminder, and what happens when it passes (5c with 19.99 € retained, or full refund)?
   **Blocks:** M5 (email 2 content), M6 (expiry outcome and its refund).

**Submission to Zulex and the KBA**

5. **When is the application "handed over to the Zulex API"?** Step 1 (after payment) or step 3 (after verification)? Per the spec, a create call at step 1 would submit to the KBA immediately, contradicting step 4 coming after step 3.
   **Blocks:** M2 (status transitions), M4 (which use case calls Zulex — skeleton can't run end to end without it).

**Payment and capture**

6. **Which Stripe event starts the application?** Document says `payment_intent.succeeded`. Verified in Stripe's docs: under manual capture, completing payment fires `payment_intent.amount_capturable_updated` and moves the PaymentIntent to `requires_capture`; `payment_intent.succeeded` fires only on capture. For SEPA Direct Debit, `payment_intent.processing` fires on submission, `payment_intent.succeeded` only when the debit settles. Listening to `payment_intent.succeeded` alone would never start a held card payment.
   **Blocks:** M4 (Stripe webhook wiring — skeleton can't run end to end without it).
7. **When exactly is a manual-capture payment captured?** Section 4 prefers manual capture, "captured when the application is confirmed" — could mean status 1, 3, 4 or 5a. But section 1 describes status 1 as "Payment has been successfully captured via Stripe", labelled "Payment captured". Under manual capture a card payment at status 1 is only authorised, so either that label and email 1 say "authorised", or capture happens at status 1. Verified in Stripe's docs: online, customer-initiated card authorisation valid 7 days on Visa and Mastercard, then funds released and PaymentIntent cancelled. Extended authorisation up to 30 days exists only on IC+ pricing; Visa charges extra 0.08 % per transaction outside travel and rental categories. A Verimi wait plus a manual-processing authority can exceed 7 days.
   **Blocks:** M4 (capture call in Stripe adapter), M5 (status 1 label and email 1 wording), M6 (hold policy), M8 ("hold expiring" runbook).
8. **How is "refund minus 19.99 €" executed when the payment was only authorised?** Verified in Stripe's docs, both possible: partial capture of 19.99 € automatically releases the rest, or full capture then partial refund. Most payments allow only one capture, so partial capture is final. Customer sees a different bank statement in each case — a business choice.
   **Blocks:** M2 (Stripe action returned by `refund-policy.ts`), M3 (payment columns), M6 (refund execution).
12. **SEPA Direct Debit timing:** verified in Stripe's docs, SEPA Direct Debit has no manual capture and is a delayed-notification method: charged at checkout, `processing` for several business days before `succeeded` or `payment_failed`. Does a SEPA order start its application at `processing` and risk a later failed debit, or wait days for `succeeded`? Refund-relevant: SEPA refunds possible for 180 days; a customer can dispute a SEPA debit with their bank for up to 13 months with no appeal, so a refunded SEPA payment can still be disputed.
   **Blocks:** M4 (payment methods offered and webhook handling), M6 (refunds and disputes on SEPA orders).
15. **Stripe Customer object:** document says store the Stripe Customer ID. Customer created per order or reused per email address, given no accounts?
   **Blocks:** M3 (payments table), M4 (Stripe adapter).
16. **`customer_email` in Stripe metadata:** OK to duplicate the email into Stripe under the GDPR minimisation rule? Already held on the Customer object.
   **Blocks:** M4 (PaymentIntent metadata), M7 (privacy policy).

**Errors, corrections and refunds**

9. **What counts as a "technical error on our side" (100 % refund) vs a "technical API error" (5b, correctable)?** The two rows overlap.
   **Blocks:** M2 (error algorithm), M6 (refund amount for technical failures).
10. **Which de-registration failures are correctable and which not?** E.g. wrong security code, VIN mismatch, already-used plate seals. Document's examples don't cover de-registration.
   **Blocks:** M5 (content of emails 5b and 5c), M6 (rejection catalogue).
11. **Can a correction ever cost more for de-registration?** If not, the "pay the difference" PaymentIntent isn't needed for the MVP.
   **Blocks:** M6 (5b option A).
18. **Scope of the automatic retry:** core principle says a second attempt is "ALWAYS" made before notifying or refunding, but step 1 limits the retry to technical errors. Does a KBA data rejection (e.g. wrong security code) also get retried once, though the same data would fail again?
   **Blocks:** M2 (error algorithm), M6 (retry behaviour).

**Legal**

13. **Right of withdrawal vs the 19.99 € fee:** can a consumer withdrawing within 14 days be charged the fee, and does ZulexGO still need the immediate-performance waiver? Needs the lawyer.
   **Blocks:** M4 (consent checkboxes at checkout), M7 (AGB fee clause).

**Emails**

17. **Email 4's "expected processing time":** fixed figure per authority status, or returned by the Zulex API?
   **Blocks:** nothing — M5 ships a placeholder per authority status until answered.

## Verification

Verified milestone by milestone via the exit criteria above — each a test, CI job, or observed staging/production run, never a claim. Two cross-cutting checks at every milestone from M1: `npm run lint && npm run typecheck && npm test -- --ci && next build` green in CI, and `tests/integration/client-bundle-secrets.test.ts` plus the codes/tokens-absent-from-logs assertion still passing. Final verification is M9's beta: real KBA confirmations observed in production before the public gate opens.
