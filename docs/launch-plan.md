# ZulexGO — MVP Production Launch Plan

## Context

ZulexGO: B2C web app for online vehicle de-registration (Außerbetriebsetzung) on the B2B Zulex API. **M0–M2 are done; M3 and M4's code are merged. M4's exit criterion, a real run on staging, waits for the Zulex API, which is down. M5 is built except its Verimi step, which waits for Q1–Q4. M6 is built: what remains of it is the founder's answers (Q10, Q20, Q23, Q26, Q35–Q40) and the Zulex error-code catalogue. Neuzulassung (N1–N8 of `docs/registration-plan.md`, N8 but for its lawyer texts) is built on top of these and not on sale (Q43).** The repo has the marketing layer (landing, legal placeholder pages, design tokens, Shadcn in `src/ui`, Jest + msw) with colocated tests, plus the foundation:
- **Config layer:** zod-validated env in `src/config/env.ts`, selected by `APP_ENV`; six driver variables (`IDENTITY_DRIVER` takes `fake` only) and stage guardrails as tests; composition root `src/config/container.ts`; `.env.example` committed.
- **Ports:** `Clock`, `TokenGenerator`, `ApplicationRepository`, `RegistrationGateway`, `PaymentProvider`, `Mailer`, `DocumentStore`, `IdentityVerification`, each with a contract suite passed by every adapter; the domain core, status machine, error algorithm, refund policy and the flow's use cases run end to end on the fakes (M2).
- **Database:** in-repo migration runner, migrations `0001`–`0012`, a Postgres repository passing the same contract as the in-memory one, and the seed for dev and staging (M3).
- **CI:** `.github/workflows/ci.yml` runs lint, typecheck, tests, build on every PR, plus the `main accepts staging only` check. ESLint boundary rule in place; a canary test proves the Zulex key never reaches the client bundle.
- **Deployment:** GitHub remote with protected `staging` and `main`, baseline security headers in `next.config.ts`. Vercel project `zulexgo-staging` deploys `staging` (created 2026-09-27, later than M1 recorded); the production project `zulexgo` is created in M8.
- **Walking skeleton (M4 code):** Zulex, Stripe and Resend adapters, each passing its port's contract; the Zulex adapter is written from `docs/api-1.yaml` and tested against an msw double of that spec, never yet against the live API. Signed Stripe webhook at `app/api/webhooks/stripe/`, poll route at `app/api/internal/poll/` behind `CRON_SECRET`, funnel at `/deregister`, status page at `/status/[token]`, and the M4 integration tests.
- **Staging drivers today:** payment on the Stripe sandbox `G&M Gastro Event GmbH Sandbox`, mail on Resend within `MAIL_ALLOWLIST`, repository on the staging Supabase project (`docs/provisioning.md` §8). Registration stays fake until the Zulex API is back; each Vercel instance holds its own fake registration gateway, which answers the same on every instance (D11, fixed). Storage flips to Supabase Storage once its service key is set (`docs/provisioning.md` §9).
- **M5 (built):** the six customer emails of a de-registration in German on React Email with reviewed HTML snapshots (a Neuzulassung adds emails 2, 3 and a reminder to verify, N5), plus the resend-link email; the Supabase Storage `DocumentStore` adapter; the status page with outcome blocks, document downloads behind the token, refund info, live refresh, and a rate-limited lookup; "Resend my link" at `/status/link-anfordern`; the `RateLimiter` port (in-memory fake, Postgres adapter, migration `0005`); `status-notifications.test.ts`. D2 and D5 are fixed on the way.
- **M6 (built):** the customer can correct their data or cancel from 5b on the status page; a failure is stored and its reason shown from our own catalogue (`src/core/domain/registration/rejection-catalogue.ts`, empty until the founder's codes exist), migration `0006`; a submission Zulex cannot confirm is resubmitted silently for 24 hours before a full refund (D4, D6); card money is captured in full at Zulex's acceptance for an online authority and before a hold can lapse otherwise, a 5b being polled daily for it (D3); a duplicate order for one vehicle is warned about (J8, migration `0007`) and a special plate warned about (J11); dev's seeded orders have payments the fake provider knows.
- **Neuzulassung (N1–N8, built, not on sale):** one order for several services (`request.service`, migration `0008`); statuses 2 and 3 for every service but de-registration (`DIRECT_SERVICES`, migration `0009`); the Neuzulassung request with its owner and bank data stored encrypted (`0010`); its calls on the Zulex adapter and the fake gateway; the identity step on the fake adapter (`checkIdentityVerification`, run by the poller and by the signed callback at `/api/webhooks/identity`; migration `0011`); the funnel at `/register`; consent stored with the order (`0012`, D9); and the status page, correction and emails for it; and (N8) its bank account erased when its order ends, its postcode check and checkout rate limited per address, and a threat model (`docs/threat-model.md`). `SERVICES_ON_SALE` lists de-registration only (Q43). Q45–Q56 hold its provisional answers.

Not built yet: the Verimi adapter (the fake runs a Neuzulassung's verification, with emails 2 and 3; the real one waits for Q1–Q4); the Zulex spike (no captured fixtures, and `docs/deregistration-user-journeys.md` has no findings from the live API); a schedule for the poll route (`docs/provisioning.md` §5), which since M6 also drives the hold checks, the daily look at each 5b and the silent resubmission, and for a Neuzulassung the identity checks; the staging run that closes M4.

Project rules (`CLAUDE.md` + `.claude/skills/`) govern *how* each arrives: test-first for domain rules, interactive behaviour, security invariants, integration boundaries and bug fixes (no tests for static presentation, tokens, or configuration); ports-and-adapters with contract tests and an in-memory fake per port; `APP_ENV`-driven stages; raw-SQL migration folders; "nothing reaches production that has not run on staging."

Milestones are dependency-ordered from current state to public launch. Per your answers: **no sizing or dates — ordering and exit criteria only**; **hosting is Vercel + Supabase**. Assumptions marked **[plan assumption]**; ambiguity under **Open questions (business logic v1.0)**.

- **Seven customer statuses, one automated email each:** 1 application submitted & payment received → 2 waiting for identity verification (Verimi link by email; selfie + ID-card scan, ~90 s) → 3 identity verification completed → 4 submitted to KBA, processing → 5a completed | 5b failed, correction possible | 5c failed, correction not possible. Separate refund email (template 6) when a refund is issued.
- **KBA submission follows identity verification:** step 3 = "the application can now be submitted to the KBA", step 4 = the transmission. At step 1 the application is "handed over to the Zulex API". Mapping of those two hand-overs onto Zulex API calls is open (Q1–Q3).
- **Internal (system-side) status labels:** 1 "Payment captured" · 2 "Waiting for customer" · 3 "Forwarding to KBA" · 4 "KBA processing" · 5a "Process completed" · 5b "Correction required" · 5c "Partial refund". Customer-facing step titles are the numbered statuses above.
- **Verimi is added later.** The real adapter waits for the founder's answers to Q1–Q4. De-registration runs 1 → 4 → 5a | 5b | 5c with six emails (1, 4, 5a, 5b, 5c, 6); a Neuzulassung runs statuses 2 and 3 and emails 2, 3 and a reminder to verify on the fake adapter (Q45). Before status 1 the code has an internal `awaiting_payment` status: the details are stored at checkout and payment is confirmed later by webhook, so the customer never sees it and it sends no email. The `IdentityVerification` port has only its fake adapter, which a Neuzulassung's flow uses and de-registration's does not.
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
 → M4 WALKING SKELETON — real Zulex (integration env) + Stripe (staging sandbox) + Mailer on staging,
      minimal funnel + status link + minimal status page
      (identity verification left out of the flow until Q1–Q4 are answered)
 → M5 Full status dashboard, all emails, documents, resend-link, Verimi step (once Q1–Q4 are answered)
 → M6 Error algorithm, correction & cancel options, refunds, capture/hold policy
 → M7 Legal content, security & privacy hardening
 → M8 Operational readiness & production provisioning
 → M9 Beta (invite-gated, real vehicles) → public launch
```

Off the critical path (started M0, landing M7/M8): legal texts (lawyer, incl. the 19.99 € cancellation-fee clause), Stripe live activation (KYC; cards, Apple Pay, Google Pay enabled; SEPA Direct Debit stays off, Q12), Zulex production API key, **Verimi integration route (Q1–Q3)**, **status-change webhook from the Zulex API team** (see poller decision), domain + mail-domain authentication, Euro Plate web licence, brand sign-off on semantic colours, the Zulex error-code catalogue the founder is chasing.

Funnel UI (M4 Track B) starts once M2's fakes exist, parallel to M3.

---

## Default technical decisions (overridable; none blocks a milestone)

| Decision | Default | Why |
|---|---|---|
| Hosting | **Vercel**, two projects on two permanent branches: `zulexgo-staging` deploys `staging` (`APP_ENV=staging`), `zulexgo` deploys `main` (`APP_ENV=production`) | Separate projects = hard secret separation, required by `environments` ("secrets must not work across stages"). Public repo so branch protection is free: no direct push to either branch, CI required on both, `main` accepts PRs from `staging` only — the forge, not habit, enforces "nothing reaches production that has not run on staging". See `CONTRIBUTING.md`. Vercel Cron drives the poller; needs a plan tier allowing per-minute crons; commercial use requires Vercel Pro regardless. |
| Database | **Supabase Postgres**, Frankfurt (eu-central-1), one project per deployed stage (staging, production); dev uses the in-memory repository | EU residency for GDPR. **Server-side only** via Supavisor pooler (transaction mode) from Vercel functions; migrations use the Supavisor session pooler, since Vercel and GitHub Actions are IPv4-only and the direct host is IPv6-only. Data API disabled; RLS on every table with no policy. No Supabase Auth (no accounts by design), no client-side Supabase SDK, no RLS-based access — the app is the only client. |
| Adapters per stage | **dev:** in-memory repository and document store (seed loaded at boot), console mail, the test mode of the `G&M Gastro Event GmbH` Stripe account, Zulex integration API, fake identity verification. **staging:** Supabase staging project (Postgres + Storage), Resend with `MAIL_ALLOWLIST`, Stripe sandbox `staging`, Zulex integration API, fake identity verification until the Verimi adapter exists. **production:** Supabase production project, Resend, Stripe live account, Zulex production API, Verimi once a service that verifies the customer is on sale (until then production accepts the fake, `fakeIdentityProblem` in `env.ts`). Stripe and Zulex adapters don't exist before M4, so until then dev runs their fakes. Fakes stay valid driver values outside production (e.g. forcing 5b or a 429 locally) and are what tests use. | Vendor-specific code for payment and registration runs in dev, not first on staging. Stripe gives one environment per stage (test mode for dev, a sandbox for staging, live for production), so keys never cross stages. Zulex has only an integration and a production environment, so dev and staging share the integration one — **[plan assumption]** with one shared key unless Zulex issues one per stage. Database and storage stay in memory in dev: no local Postgres to run; the SQL is exercised by the CI Postgres service container and then staging. Mail stays on the console so seeded addresses are never mailed. Live Stripe needs business verification, due by M8. |
| Postgres driver | `pg` (node-postgres) behind the `ApplicationRepository` adapter | No ORM; raw-SQL migrations stay the single source of truth. |
| Migration runner | **Small in-repo runner** (TDD'd) reading `db/migrations/NNNN_slug/{up,down}.sql`, recording version + checksum in `schema_migrations`, one transaction per migration | Supabase CLI migrations are flat, timestamped, up-only — incompatible with the skill's folder-with-`down.sql` rule. Owning ~100 lines beats amending the skill. Override: adopt Supabase CLI and amend `database-migrations`. |
| Document cache | **Supabase Storage**, private bucket, server-side only, signed URLs never exposed — app streams the PDF after token validation | Keeps official confirmations out of Postgres rows and behind the dashboard's token check. |
| Status updates from Zulex | **Per-application polling with backoff, driven by a Vercel Cron heartbeat.** Cron hits `app/api/internal/poll/route.ts` every minute with bearer `CRON_SECRET`; only rows with due `next_poll_at` are fetched — the API is *not* swept every minute. Default schedule: authority `online` → 1, 2, 5, 10, 30 min, then hourly; `unavailable`/`offline` (manual processing) → every 6 h, then daily; any `Retry-After` overrides; terminal states stop polling. ~10–30 GETs per application over its life. | Zulex API has no application-status webhook — spec only says in prose that a `noticeId` arrives "via webhook", with no registration or payload contract. Polling is the only way to catch a transition when nobody views the status page, and every change requires an email. **Better alternative, pursued in parallel:** ask the Zulex API team for a signed status-change webhook (`applicationId`, new `status`, `documents`). If it lands, `app/api/webhooks/zulex/route.ts` (signature-verified) triggers `advance-status` immediately and the poller drops to a slow hourly reconciler for missed deliveries — never removed, since a lost webhook otherwise means a customer never emailed. A queue service (Inngest/QStash) would replace the cron with per-application delayed jobs; fair choice but adds a vendor for no gain at MVP volume. |
| Transactional mail | **Resend** (EU data-processing terms confirmed at sign-up); templates in **React Email**, wording in `src/adapters/mail/resend/copy.ts` | Simplest API and domain auth; `Mailer` port + contract suite make Postmark/Brevo a one-folder swap if EU posture requires. Business-logic document: Resend free up to 3,000 emails/month. At up to eight emails per order ≈ 375 orders/month, so M8 watches volume against the tier. |
| Payment | **Stripe Payment Element**: card (Visa, Mastercard), SEPA Direct Debit, Apple Pay, Google Pay; PaymentIntent created at checkout; **manual capture**, the document's preferred option "if technically feasible" — otherwise the document's default, automatic capture. Stripe has no manual capture for SEPA Direct Debit (verified in Stripe's docs), so capture is set per payment method: `payment_method_options[card][capture_method]=manual` holds cards, SEPA Direct Debit captured automatically. A single PaymentIntent with top-level `capture_method=manual` cannot offer card and SEPA together (Q12). No custom card processing — Payment Element keeps ZulexGO PCI-DSS compliant without separate certification. Refunds only via Refunds API, never by hand in the Stripe dashboard. Webhooks `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, each signature-verified. Metadata `order_id`, `service_type`, `customer_email`, `application_id`. ZulexGO stores only Stripe Customer ID and PaymentIntent ID, never payment data. **As built:** cards only (Apple Pay and Google Pay as card wallets) under top-level `capture_method=manual`, no SEPA Direct Debit (Q12); the webhook acts on `payment_intent.amount_capturable_updated` and `payment_intent.succeeded` only (Q6, Q35); metadata is `order_id`, `service_type` and, once Zulex accepts the application, `application_id`, without `customer_email` (Q16); no Customer is created, so only the PaymentIntent ID is stored (Q15) | All fixed by business-logic document §4. Manual capture conflicts with two other requirements in that section — Q6, Q7. Stripe facts here and in Q6–Q8, Q12 checked against Stripe's documentation. |
| Encryption of codes at rest | Application-level AES-GCM in the Postgres adapter, key from env (rotatable), from migration `0001` onward | Key stays off the DB host; in-memory fake stays plaintext; no later data migration. |
| Icon library | **lucide** (installed, Shadcn default), `ChevronRight` as bullet. **Settled in M0:** `docs/design-standard.md` §5.5 amended from Font Awesome to lucide, deviation from the print style guide recorded in that section. | One library, not two. Shadcn writes lucide imports into every generated component, so a second set is hand-maintained. Font Awesome trialled in M0 and reverted for that reason; it is also not a Shadcn `iconLibrary` value (`lucide`, `tabler`, `hugeicons`, `phosphor`, `remixicon`), so the CLI couldn't target it. Icons are decorative, no brand mark, so no brand sign-off outstanding. |
| Refund policy | **Fixed by business-logic document §3:** success → full capture, no refund · correct & resubmit → charge the difference only, if any · cancel at 5b → refund minus 19.99 € · non-correctable (5c) → refund minus 19.99 € · technical error on our side → 100 % refund · resubmit after cancel → new order, new PaymentIntent, full price. 19.99 € lives in `src/core/domain/payment/pricing.ts` as one constant. | Not a plan decision. Executing "refund minus 19.99 €" on an only-authorised payment is Q8. |
| Price display (PAngV) | One all-inclusive price per service incl. authority fee and the 19.99 € processing fee, from the founder's price list in `src/core/domain/payment/pricing.ts` (read by the landing page and the checkout); reconciled monthly against `FEE` documents | The founder's price list (September 2026) fixes the prices. API reports fees only after the fact; customer needs the total before paying. |

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
- Add `zod` as direct dependency. `src/config/env.ts` validates `APP_ENV`, `DATABASE_URL`, `DIRECT_DATABASE_URL`, `ZULEX_BASE_URL`, `ZULEX_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_DRIVER`, `PAYMENT_DRIVER`, `REGISTRATION_DRIVER`, `REPOSITORY_DRIVER`, `STORAGE_DRIVER`, `MAIL_ALLOWLIST`, `APP_BASE_URL`, `CODES_ENCRYPTION_KEY`, `CRON_SECRET`, `SUPABASE_STORAGE_*`. Fails fast naming the missing variable.
- **Five driver variables, not three** (Deviation 5), plus a sixth, `IDENTITY_DRIVER`, in M5 for the Verimi step. Each names a port's adapter and gates that adapter's credentials:

  | Driver | Values | Gates | Flips to the real value in |
  |---|---|---|---|
  | `PAYMENT_DRIVER` | `fake` \| `stripe` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | M4 |
  | `REGISTRATION_DRIVER` | `fake` \| `zulex` | `ZULEX_BASE_URL`, `ZULEX_API_KEY` | M4 |
  | `MAIL_DRIVER` | `console` \| `resend` | `RESEND_API_KEY`, `MAIL_FROM`; `MAIL_ALLOWLIST` on staging | M4 |
  | `REPOSITORY_DRIVER` | `fake` \| `postgres` | `DATABASE_URL`, `DIRECT_DATABASE_URL`, `CODES_ENCRYPTION_KEY` | M3 |
  | `STORAGE_DRIVER` | `fake` \| `supabase` | `SUPABASE_STORAGE_URL`, `SUPABASE_STORAGE_BUCKET`, `SUPABASE_STORAGE_SERVICE_KEY` | M5 |
  | `IDENTITY_DRIVER` | `fake` today; `verimi` is added with its adapter | Verimi credentials — names pending Q1–Q3 | M5, once the adapter exists |

  A variable is required **only when its driver is switched on**: until M4, `APP_ENV=dev` boots on fakes with no secrets; staging deploys in M1 before any vendor credential exists. From M4, dev's `.env.local` carries the Stripe `dev` sandbox keys and the Zulex integration key (see Adapters per stage). Production rejects every fake value (the identity driver's only while a service that verifies the customer is on sale, below), so it cannot quietly run on one.
- Guardrails as tests: live Stripe key rejected unless production; test key rejected in production; production Zulex URL rejected unless production; production rejected on any fake driver (the identity driver only while a service that verifies the customer is on sale, `fakeIdentityProblem` in `env.ts`); staging mail confined to `MAIL_ALLOWLIST`, which production forbids; no source file branches on `NODE_ENV`.
- `src/config/container.ts` — `createContainer(env)`. First two ports the full 7-step way (port → contract → fake → real → wire → lint): `Clock` and `TokenGenerator`, so the pattern exists before Stripe/Zulex.
- ESLint `no-restricted-imports` block from `external-services` in `eslint.config.mjs`.
- `.env.example` committed with every variable and a one-line comment.
- `.github/workflows/ci.yml`: `npm ci`, lint, typecheck, `jest --ci`, `next build` with placeholder staging env and a canary `ZULEX_API_KEY` that must not appear in `.next/static`. Second job, `main accepts staging only`, fails any PR into `main` whose source isn't `staging`. First required on both branches, second on `main` only.
- Vercel: two projects; `zulexgo-staging` auto-deploys `staging`, `zulexgo` auto-deploys `main` — branch protection is the gate, production has none of its own. Supabase: staging project provisioned (schema in M3).
- `next.config.ts`: baseline security headers (HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`). CSP deferred to M7 once Stripe Elements' needs are known.

**Exit criteria:** CI required on `main` and `staging` and red on a deliberately failing test; staging URL serves the marketing page; a test proves `createContainer` with an `sk_live_` key and `APP_ENV=staging` throws; `tests/integration/client-bundle-secrets.test.ts` still passes.

---

### M2 — Domain core and all ports with in-memory fakes

**Goal:** Whole flow — checkout, identity verification, KBA submission, polling, error algorithm, status — runs end to end in memory, no vendor, network, or database.

**Why here:** Fakes let the funnel UI and use cases be built test-first while real adapters are written in parallel. The status machine is pure logic; must exist before M3 schema encodes it and M5 dashboard renders it.

**How:**
- `src/core/domain/`: `LicencePlate`, `SecurityCode` (3-char seal / 7-char certificate; `toString()` redacts), `Vin`, `Money`, `ApplicationReference` (`ZG-XXXXXX`), and **`ApplicationStatus`** — `awaiting_payment` (internal, never shown: stored at checkout until the webhook confirms payment) → `submitted_and_paid` (1) → `submitted_to_kba` (4) → `completed` (5a) | `failed_correctable` (5b) | `failed_final` (5c), plus `cancelled` for the 5b cancel option. Verimi's `awaiting_identity_verification` (2) and `identity_verified` (3) were added later (N2, migration `0009`), between 1 and 4, on the path of every service but de-registration. The one silent retry is an internal attempt counter on the application, not a customer status (customer not notified). Pure `advance(status, event, journey)` with every transition tested; unknown Zulex status tag keeps `submitted_to_kba`. **Events for 1 → 2 and 2 → 3 (`identityVerificationStarted`, `identityVerified`) are provisional (Q1–Q3)**; the fake identity adapter drives them.
- `src/core/domain/payment/refund-policy.ts` — pure function from outcome to Stripe action and customer amount, one test per row of §3 table.
- `src/core/errors/`: domain errors (`ValidationError`, `GatewayRejected`, `GatewayUnavailable`, `PaymentDeclined`, `HoldExpired`, `TokenInvalid`, `IdentityVerificationFailed`…).
- `src/core/ports/`, each with a documented guarantee list and a `*.contract.ts` suite: `ApplicationRepository`, `RegistrationGateway`, `PaymentProvider`, `Mailer`, `DocumentStore`, `IdentityVerification` (+ `Clock`, `TokenGenerator` from M1). `IdentityVerification` gets port and fake here, outside the flow at first (a Neuzulassung's flow uses it since N5, Q45); real adapter waits for Q1–Q4.
- `src/adapters/*/fake/` — one in-memory fake per port passing its contract. Fake gateway scriptable (next status, next error, 429 + `Retry-After`) to drive J3–J6; fake payment provider models hold expiry via injected `Clock`; fake mailer records sends.
- `tests/fixtures/` + `tests/msw/` skeletons with obviously fake values (`AAA111`, `example.test`), validated by the adapters' zod schemas.
- Dev container: `APP_ENV=dev` → all fakes until M4, when payment and registration flip to the test mode of the `G&M Gastro Event GmbH` Stripe account and the Zulex integration API; repository, document store and identity verification stay fake in dev, mail stays console.

**Port order:** `ApplicationRepository` (use cases need it) → `RegistrationGateway` and `PaymentProvider` (skeleton) → `Mailer` (status link delivered only by email, so on the skeleton's path) → `IdentityVerification` (port and fake only; outside the de-registration flow, Q4) → `DocumentStore`.

**Exit criteria:** every port has a contract suite and passing fake; one test per status transition; a test that `SecurityCode` never appears in `JSON.stringify` or `String()` output.

---

### M3 — Supabase Postgres, migration runner, schema, seed

**Goal:** Applications, payments, status history, tokens persist across requests in staging and production; a developer sees every UI state right after starting the dev server.

**Why here:** On Vercel nothing survives between checkout request, status-page visit, and poller tick — skeleton impossible without a real repository. Schema encodes M2's machine.

**How:**
- In-repo migration runner (`src/adapters/repository/postgres/migrator.ts`) with `db:migrate`, `db:migrate:down [count | all]`, `db:status`: one transaction per migration, version + checksum in `schema_migrations`, an advisory lock against concurrent deploys, refuses to run if a migration that already ran was edited. `down` runs in dev only. CI runs up → down all → up through the CLI against a Postgres 17 service container (the skill's rehearsal), and again as `tests/integration/migration-rehearsal.test.ts`.
- `db/migrations/0001_create_applications` (status as a Postgres domain over `APPLICATION_STATUSES`, AES-GCM `encrypted_security_codes` bound to the row, `idempotency_key` unique, `zulex_application_id`, `next_poll_at`, `poll_attempts`, `authority_ikfz_status`, `agb_version`, `consent_at` — consent columns now avoid an expand/contract cycle in M7 — `retry_attempts` for the one silent retry), `0002_create_payments` (`stripe_payment_intent_id`, `stripe_customer_id`, total, captured, refunded and retained-fee cents — the only Stripe data stored; customer ID and amounts stay unwritten until Q15 and Q7/Q8 are answered), `0003_create_status_history`, `0004_create_status_tokens` (SHA-256 hash for lookup, AES-GCM copy so later emails repeat the link; one row per application, so a new token revokes the old). Each folder: `up.sql`, `down.sql`, `README.md`. **No identity-verification column:** Verimi is added later (Q1–Q4); its statuses and state arrived later, as migrations `0009`, `0010` and `0011`.
- `src/adapters/repository/postgres/` passing the `ApplicationRepository` contract against Postgres (skipped locally without `TEST_DATABASE_URL`, mandatory in CI). The contract gained the cases a SQL mapping can break: every status, a one-plate vehicle with every optional field, history appends, changed codes. Dev never runs it; dev uses the in-memory repository.
- `db/seed/seed.ts`: the same data for dev and staging. Loaded into the in-memory repository by `src/config/container.ts` at every boot, and into staging's database by `npm run db:seed` on every staging deploy, which adds what is missing and leaves rows someone has changed alone. Keyed by reference, deterministic, throws when `APP_ENV=production` (guardrail test); one de-registration for every status it passes through (all but 2 and 3: seven) and one Neuzulassung for every `ApplicationStatus` value (nine), each reached through the real status machine and openable by a fixed token: `seed-status-link-<status>` for a de-registration, underscores written as hyphens (`seed-status-link-submitted-to-kba`), and `seed-status-link-new-registration-<status>` for a Neuzulassung; each status owns a fixed reference so a status inserted later moves no seeded row — coverage test iterates the enum per service, so the M5 dashboard cannot render a state the seed lacks. Seeded rows carry fake Zulex and payment ids, so on staging M4's poller and Stripe adapter must tolerate them.
- Staging Supabase migrated by the Vercel build (`scripts/vercel-build`, set as `buildCommand` in `vercel.json`) on production deployments of a project with `REPOSITORY_DRIVER=postgres`, before `next build`, so a failed migration fails the deploy; staging then runs `npm run db:seed`. Previews and the not-yet-configured production project skip both. Production is never seeded (guardrail test). Staging and production flip `REPOSITORY_DRIVER=postgres`, making `DATABASE_URL`, `DIRECT_DATABASE_URL`, `CODES_ENCRYPTION_KEY` required at boot. Click-by-click: `docs/provisioning.md` §3.

**Exit criteria:** CI migration rehearsal green; Postgres adapter passes the same contract file as the fake; enum-coverage seed test green; loading the seed with `APP_ENV=production` throws.

---

### M4 — Walking skeleton on staging

**Goal:** One real test-mode de-registration on staging: Stripe test card authorised → signed Stripe webhook starts the application → order-confirmation email with status link delivered to an allowlisted address → application created at `https://integration-zulex.de/zulex-api/v1` → poller advances status → status page shows current step.

**Why here (the skeleton boundary):** earliest point exercising all irreducible unknowns together — real Zulex integration-env behaviour (error bodies, whether it reaches `FINISHED`, 429 behaviour), Stripe manual capture, email deliverability, polling on serverless. Everything before M4 is the minimum to run it; everything after is hardening or scope.

**Track A — adapters and use cases:**
- Time-boxed **read-only spike** against the integration env (throwaway, untested, never production code): capture real shapes for create/get/patch, `/registration-authorities`, `/documents/{id}`, an induced 400 and a 429. Scrub → `tests/fixtures/zulex/`; findings → `docs/deregistration-user-journeys.md`; delete spike code.
- `src/adapters/registration/zulex/`: zod response schemas, `X-Idempotency-Key` on every create, `X-Api-Key` from env, `Retry-After` honoured, unknown tags → in progress, vendor errors → domain errors. Passes contract via msw handlers built from the spec (from captured fixtures once the spike has run).
- `src/adapters/payment/stripe/`: Payment Element with cards, Apple Pay and Google Pay (no SEPA Direct Debit, Q12); PaymentIntent at checkout with `capture_method=manual`, metadata `order_id`, `service_type`, `application_id` (last set once Zulex returns it; no `customer_email`, Q16); authorize / capture / release / full refund / partial refund, all idempotent on our ids; hold expiry → domain error. Contract via stripe-mock/msw.
- `app/api/webhooks/stripe/route.ts`: signing secret validated every call. In dev, events from the Stripe test mode arrive via `stripe listen --forward-to localhost:3000/api/webhooks/stripe`, which supplies its own signing secret. `payment_intent.amount_capturable_updated` or `payment_intent.succeeded` → start application (Q6); a failed payment is shown to the customer by the browser, not by webhook, and `charge.refunded` is not handled (Q35).
- Only the PaymentIntent ID persisted (no Stripe Customer is created, Q15) — a test asserts no other Stripe payment field reaches the repository.
- `src/adapters/mail/resend/`: passes `Mailer` contract via msw; **dev hard-blocks sending; staging enforces `MAIL_ALLOWLIST`** (tests for both). Two templates for now (M5 built the rest): email 1 (order confirmation, order ID, status link) and a generic status change.
- Add each SDK to `no-restricted-imports` in the same change as its adapter.
- Use cases: `check-eligibility` (prefix → `ikfzStatus` → processing-time expectation), `submit-checkout` (create PaymentIntent → persist encrypted, since the order stores the payment's id → confirm in Payment Element), `confirm-payment` (from Stripe webhook: status 1 → issue token → email 1 → hand over to `submit-to-kba`, or for a service that verifies the customer first (Neuzulassung, Q45) to `start-identity-verification`; de-registration does not verify, Q4), `submit-to-kba` (create Zulex application with `X-Idempotency-Key` → status 4; technical error retried once silently, then to M6's error algorithm), `advance-status` (one GET per *due* row, reschedule with the decisions-section backoff table; never logs codes or tokens), `get-status-by-token`.
- `app/api/internal/poll/route.ts` behind `CRON_SECRET`; `vercel.json` cron every minute (not there yet: D1). Backoff schedule is a pure function (`nextPollAt({ ikfzStatus, attempts, now, retryAfterMs })`) tested on every branch, so API load is a table, not behaviour scattered through the poller.
- If the Zulex webhook exists by now: `app/api/webhooks/zulex/route.ts`, signature-verified, replay-protected, calls `advance-status` for the one application; cron drops to reconciler cadence. Same use case, second trigger.
- Integration tests: `deregistration-checkout.test.ts` (checkout → webhook → status 1 → status 4; unsigned webhook rejected), `status-polling.test.ts`, plus the required assertion that codes and tokens are absent from rendered status HTML. The log half exists since M3: `tests/integration/secrets-absent-from-logs.test.ts`.

**Track B — minimal funnel and status page (starts after M2, parallel to M3):**
- `app/(funnel)/deregister/`: progress indicator; eligibility (plate count, documents check, prefix → availability notice); application form (plate, VIN, codes with contextual front code, email, locator-image placeholders); review & pay (masked summary, total price, T&Cs + right-of-withdrawal consent, **19.99 € processing-fee notice visible before the pay button**, Stripe Payment Element, sticky mobile CTA); confirmation (order ID, "your status link is on its way to {email}").
- `app/status/[token]/`: vehicle summary + read-only stepper from the domain enum; invalid token → neutral error page, no existence disclosure.
- Client validation shares zod schemas from `src/core/domain`. Plate rendered with existing `plate-text` fallback until Euro Plate is licensed.
- **Tested (per `CLAUDE.md`):** form validation and contextual front-code field, forward/back navigation with preserved state, CTA disabled until T&Cs and right-of-withdrawal consent ticked, processing-fee notice present before payment is possible (legal requirement, so behaviour, not copy), invalid-token error page, accessible names on every input. **Not tested:** progress indicator, confirmation copy, section frames, stepper visual states.

**Convergence:** dev container wired `REGISTRATION_DRIVER=zulex`, `PAYMENT_DRIVER=stripe` (Stripe test mode) — repository fake, mail console; staging container wired `REGISTRATION_DRIVER=zulex`, `PAYMENT_DRIVER=stripe` (Stripe `staging` sandbox), `MAIL_DRIVER=resend`, identity verification still fake; run the scenario by hand with a Stripe test card and allowlisted inbox, first in dev, then on staging.

**Exit criteria:** on staging, one run yields an `applications` row with a Zulex `applicationId`, a test PaymentIntent with its three metadata keys (`order_id`, `service_type`, `application_id`; Q16), a delivered email 1, ≥1 poller-driven status transition, and a status page on the right step; the two integration flows + secrets-absent test pass in CI; boundary lint fails on a deliberate `import Stripe from 'stripe'` inside `src/core/`.

**Risks:** integration env may never reach `FINISHED` or return documents (then completed path proven via msw, confirmed in beta); spike may force port renames — do it day one; Stripe Elements CSP needs — noted for M7.

---

### M5 — Full status dashboard, notifications, documents, resend-link, identity verification

**Goal:** A paying customer follows every step by email and dashboard, verifies identity, and downloads the official confirmation when finished.

**Status:** built except the Verimi adapter. Statuses 2 and 3, emails 2 and 3, a reminder to verify and the 2 → 3 transition run for a Neuzulassung on the fake identity adapter (`IDENTITY_DRIVER` accepts `fake` only); de-registration does not verify (Q4, provisional). What remains is the Verimi adapter, waiting for Q1–Q3, and a run on staging with the storage key set.

**How:**
- The emails of business-logic document §5 (eight; emails 2 and 3, and a reminder to verify, are sent for a Neuzulassung only), as reviewed HTML snapshots (the one snapshot case `CLAUDE.md` permits), with no security codes and no token beyond the status link:

  | # | Trigger | Subject | Content |
  |---|---|---|---|
  | 1 | After payment | Your ZulexGO application has been received | Confirmation, order ID, status link |
  | 2 | Verimi step (Neuzulassung only) | Please verify your identity | Verimi link, instructions, deadline |
  | 3 | Identity verified (Neuzulassung only) | Identity verification successful ✓ | Confirmation, next step |
  | 4 | Submitted to KBA | Your application is with the KBA | Status update, expected processing time |
  | 5a | Successful | Done! Your application is complete ✓ | Congratulations, documents |
  | 5b | Error – correctable | Your application requires a correction | Error reason, correction link, cancel option + fee notice |
  | 5c | Error – not correctable | Your application has been rejected | Rejection reason, refund info (minus 19.99 €) |
  | 6 | Refund | Your refund is on its way | Amount, timeframe (3–5 business days) |

  German wording is a translation task, not in the document. 5a's "plate shipping info" applies to registrations only; omitted for de-registration.
- **[plan assumption]** A "resend my link" email beyond these; not in the document. Built: `statusLinkResent`, mailed to the address on file only, carrying the new link.
- **Verimi step (status 2 → 3), added later:** the real `IdentityVerification` adapter; email 2, the reminder and the 2 → 3 transition already run on the fake (N5). Shape depends entirely on Q1–Q4; can't be broken down further until answered.
- `src/adapters/storage/supabase/` — Supabase Storage cache of Zulex documents — passing the `DocumentStore` contract; `UNKNOWN` → "Dokument". Staging and production flip `STORAGE_DRIVER=supabase`, making `SUPABASE_STORAGE_*` required at boot.
- Dashboard: stepper (three rows for a de-registration: 1, 4 and the outcome 5a | 5b | 5c; five for a Neuzulassung, with 2 and 3) with timestamps from `status_history`, each step showing the document's status line (e.g. "Waiting for customer" at step 2, "KBA processing" at step 4), outcome block (5a success + downloads / 5b reason + correct or cancel / 5c reason + refund info + start a new application), help block, **"Resend my link"** (email + reference → send to the *stored* address only; constant-time response; rate-limited; token rotated on resend), revalidation on focus/interval, stepper pulse while polling.
- Token lifecycle: ≥128-bit, revocable, rate-limited lookups.

**Exit criteria:** `status-notifications.test.ts` drives the fakes through every transition, asserting exactly one email per transition — none during the silent retry — with no code in any body; staging drops non-allowlisted recipients (test); a fixture document downloads through the token-guarded route.

**Met in CI:** the first (`tests/integration/status-notifications.test.ts`, which also proves an email that fails to send is not lost), the second (`resend-mailer.test.ts`), and the third (`tests/integration/document-download.test.ts`). **Only staging can confirm:** that the Supabase key and bucket work (the deploy's `db:seed` stores a test confirmation in the bucket, and `/status/seed-status-link-completed` offers it), and how the emails look in a real client.

---

### M6 — Error algorithm, correction and cancel options, refunds, hold policy

**Goal:** Every failure follows the document's algorithm — one silent automatic retry, then 5b or 5c — and every outcome produces exactly the Stripe action and customer amount in its §3 table.

**Status:** built. The error algorithm and refund policy were M2's and are unchanged for a KBA technical error; M6 added the rejection catalogue and the stored failure, cancel and correct from 5b, the hold policy, and J8 and J11. Waiting on the founder: Q10 (the codes), Q20, Q23, Q26 and Q35–Q40 (each has a provisional answer in code and a note on what to change). Waiting on staging: see below.

**As built:**
- **Failure and reason:** `Application.failure` (`src/core/domain/registration/failure.ts`) holds the kind and, for a KBA error, its code (migration `0006`); the vendor's description is never stored. The status page and emails 5b and 5c show `reasonFor(failure)`, our wording from `REJECTION_CATALOGUE`, general for every code until the catalogue has entries. An order stored before failures were kept reads with the general wording.
- **A submission Zulex cannot confirm** (timeout, 429, 5xx, 409, an answer we cannot read, a 401, 403 or 404 on create) is resubmitted under the same idempotency key on the online backoff, silently, for 24 hours (`SUBMISSION_PATIENCE_MS`), then 5c with a full refund and a log line asking support to check the Zulex portal for a stray application (D4, D6). Only a 400 on the first attempt is known to have filed nothing and goes straight to 5b; a 400 answering a retry says nothing about the attempt before it, so it is one more unconfirmed try. Once the application is filed, a failure to take the money or send email 4 backs off (a minute, then the online poll table) instead of retrying every tick. A KBA technical error still gets exactly one silent retry.
- **5b, correct and resubmit** (`src/core/use-cases/application/correct-application.ts`, `app/status/[token]/_components/correct-order.tsx`): the VIN and the three security codes, the form starting empty (Q26; a Neuzulassung's form takes the eVB number, the Teil II and, until its identity is verified, name and birth date: Q47, Q53). An application Zulex holds is patched (only the changed fields, and not again if Zulex is already working on it) and is saved at status 4 before email 4 goes out again; that repeat email is best effort (a failure is logged, not thrown), because an order left at 5b while Zulex works would never be polled. One Zulex refused outright is filed afresh under a new idempotency key (Q37). A refusal or an outage leaves the order at 5b. A correction costs nothing extra (Q11). It is refused (`PaymentNoLongerWhole`) once any of the order's money has gone back, and the page then offers only the cancel to finish.
- **5b, cancel** (`src/core/use-cases/application/cancel-application.ts`): a confirmation dialog names the fee and the refund; money moves first, then email 6, then the status, so a failure leaves the order at 5b to ask again. From a held card only the fee is captured, which releases the rest; from a captured payment all but the fee is refunded. Cancel and correct first claim the order with a version-checked write, before any money moves or anything is sent to Zulex, so whichever loses a race fails first and can be asked again.
- **5c** was M5's: the refund minus 19.99 €, emails 5c and 6, a new application offered.
- **Hold policy** (Q7, Q20; `src/core/domain/payment/hold-policy.ts`, `src/core/use-cases/payment/secure-hold.ts`): an online authority's card is captured in full once Zulex accepts the application; a hand-processed order stays held, checked on every poll; a 5b is polled daily for its money (`failed_correctable` is now in `POLLED_STATUSES`); a hold within 48 hours of lapsing is captured in full. A hold that lapsed anyway ends the order as the KBA decided, with nothing kept, and the log names it.
- **J8:** `submitCheckout` refuses with `OpenApplicationExists` unless the customer confirmed; **J11:** a checkbox in eligibility.
- **Actions:** every attempt to cancel or correct, invalid ones too, counts against the caller's address (`RATE_LIMITS.orderChange`, 10 an hour) before anything is read; an unknown link and an order that cannot be changed get one answer; a failure is logged by kind only.
- **Dev:** the seed gives each seeded order a payment the fake provider knows (`db/seed/data/payments.ts`), so dev shows refund amounts and cancelling the seeded 5b works. Staging's provider is Stripe, which does not know them: cancelling the seeded 5b on staging answers "failed" (the customer is told to try again and nothing moves); correcting it works, against staging's fake Zulex gateway.

**Where the built M6 differs from the text above:**
- The hold policy captures ahead of expiry instead of emailing a re-authorisation request (Q20 has the plan's alternative and where to change).
- Email 6 goes out when the refund is accepted, not after `charge.refunded` (Q35).
- `payments.captured_cents`, `refunded_cents` and `retained_fee_cents` stay empty; Stripe is the record (Q36).
- The correction form starts empty and offers the VIN and codes, not "fields as §2.3, prefilled except codes" (`docs/site-contract.md` §2.6 says which).
- "Exactly one retry" holds for a KBA technical error. A create that cannot be confirmed has no application to retry, so it is resubmitted for 24 hours.

**How:**
- **Error algorithm** (`src/core/domain/registration/error-algorithm.ts`, pure): technical error (API timeout, KBA temporarily unavailable, Zulex `ERROR`) → exactly **one** automatic retry via `/applications/{id}/retry`, no customer notification, no refund → success → 5a → failure classified. Retry for non-technical rejection: Q18. Correctable (5b): wrong data the customer can fix, technical API error. Non-correctable (5c): wrong owner data, identity verification failed. Document's examples come from registration services (eVB number, plate availability, owner address); de-registration mapping is Q10.
- **5b, option A — correct and resubmit:** dashboard correction form → `PATCH` → back to status 4. Only a price difference is charged, as a separate PaymentIntent, only if one arises (Q11).
- **5b, option B — cancel:** from the dashboard or the correction link in email 5b; refund amount minus 19.99 €; status `cancelled`; email 6 on `charge.refunded`. Fee shown next to the cancel button.
- **5c:** refund minus 19.99 € → email 5c, then email 6; dashboard offers a new application (new order, new PaymentIntent, full price).
- **Technical error on our side:** 100 % refund. Boundary vs "technical API error → 5b" is Q9.
- All refunds triggered by code via the Refunds API; nothing by hand in the Stripe dashboard.
- Data-driven `src/core/domain/registration/rejection-catalogue.ts` (Zulex error code → correctable | non-correctable, with German copy), fed by the founder's error-code catalogue.
- **[plan assumption]** Hold policy (J7): capture on Zulex `201` when `ikfzStatus=online`; otherwise hold and capture on `FINISHED`; if the hold nears expiry, email a re-authorisation request. Document says only "captured when the application is confirmed" (Q7).
- **[plan assumption]** J8: duplicate warning for same plate + VIN with an open application.
- **[plan assumption]** J11: special plates flagged "may be rejected" in eligibility until the provider clarifies.

**Exit criteria:** error-algorithm test proves exactly one retry, no customer email and no refund before classification; one test per §3 refund-table row asserting Stripe action and amount (e.g. refund = total − 19.99 €); refund idempotency test; a 5b cancel and a 5c each produce email 6 only after `charge.refunded`.

**Fallback if the error catalogue is still missing at launch:** **[plan assumption]** unrecognised error → correctable (5b), since the customer can still cancel there for the same 19.99 € lost at 5c; support alerted on every unrecognised code for reclassification. Catalogue update = data PR with a test.

**Met in CI:** the error algorithm proves one retry for a KBA technical error, none of the customer emails or refunds before classification (`error-algorithm.test.ts`, `tests/integration/deregistration-flow.test.ts`); one test per §3 refund row (`refund-policy.test.ts`), and through the real Stripe adapter at the network for cancel (`tests/integration/correction-and-cancellation.test.ts`); refund idempotency (`cancel-application.test.ts`, `status-notifications.test.ts`); a cancel and a 5c each send email 6, once (differs from the text above: Q35); the hold policy (`hold-policy.test.ts`, `tests/integration/hold-policy.test.ts`); correction through the real Zulex adapter at the network. **Only staging can confirm:** that migrations `0006` and `0007` apply on the deploy (CI's rehearsal runs them); the real Stripe partial capture and refund on a real PaymentIntent (Stripe's docs give the refundable balance as `amount_received` minus `amount_refunded`, which implies the released remainder of a partial capture is not counted as refunded, as `src/adapters/payment/stripe/map.ts` assumes; check it on a real object); the real Zulex `PATCH`, and whether a replayed key returns the same application (Q23); and everything that needs the poller, which has no schedule (D1): the hold checks, the daily look at a 5b and the silent resubmission do not run on staging until the cron is on.

---

### M7 — Legal content, security and privacy hardening

**Goal:** The service may legally take money from a German consumer and would pass a security review.

**Why here:** consent capture needs M3's columns and M4's checkout; CSP needs the final third-party script set; retention needs M5's terminal states.

**How:**
- Lawyer-reviewed AGB/Impressum/Datenschutz replace placeholders. AGB carry the 19.99 € processing-fee clause for cancellation and non-correctable failure, stating what it covers (Zulex API fee and administration); Datenschutz covers Verimi's processing of ID and selfie data once Verimi is added. AGB version + right-of-withdrawal consent stored per application (tests: checkout impossible without them; built with a draft version, D9). Right of withdrawal vs 19.99 € fee: Q13.
- PAngV price from `src/core/domain/payment/pricing.ts`; VAT and authority fee itemised.
- `next.config.ts` CSP (Stripe domains), `frame-ancestors`, permissions policy — asserted in route tests.
- Rate limiting on eligibility and checkout, with tests, through the `RateLimiter` port. Status lookup, document downloads and "resend my link" are limited since M5 (per address, and per order for resend).
- Log-redaction layer + required test that codes/tokens never appear in logs; `audit_log` migration for status changes and refunds.
- Retention cron: purge security codes N days after a terminal state; anonymise after the statutory period; uses the `Clock` port. (The rate limiter forgets counts older than a day by itself.)
- `/security-review` of the branch, `npm audit`, dependency pinning; short threat-model note (token brute force, IDOR on documents, webhook replay).
- Brand items: apply approved semantic colours; Euro Plate self-hosted WOFF2 if licensed, else the existing fallback ships (checked in the browser, not tested — presentation).

**Exit criteria:** legal pages contain reviewed text, no placeholder; consent-gate test; header tests; retention test; a rendered status page snapshot contains no 3- or 7-character code from fixtures.

---

### M8 — Operational readiness and production provisioning

**Goal:** Production exists, is observable and recoverable; the team answers "what do we do when X" from a runbook.

**How:**
- Production Vercel project + production Supabase (Frankfurt), `APP_ENV=production`, live Stripe keys (business verification of the live account complete), Zulex production key, `https://app.zulex.de/zulex-api/v1`. Deploy pipeline runs guardrail tests against each stage's real config (production rejects a test key; staging rejects the production URL).
- Domain, TLS, SPF/DKIM/DMARC for the mail domain.
- Monitoring: error tracking; uptime on `/` and the status route; poller-lag alert (`next_poll_at` overdue); Zulex-call-volume alert (GETs/hour above expected envelope = backoff broken); stuck-application alert (in `submitted_to_kba` beyond authority SLA); Stripe webhook failure alert; capture/refund anomaly alert; daily reconciliation (Stripe captures vs applications); monthly email volume vs Resend tier (3,000 free emails/month).
- `docs/runbooks/`: stuck application, failed refund (re-triggered via the app's own tooling — document forbids manual refunds in the Stripe dashboard), hold expiring, Zulex outage, key rotation (config change and redeploy, no code change), rollback incl. `down.sql` rehearsal on staging, restore from Supabase PITR.
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
| Verimi integration route (Q1–Q4) | added later | whether launch waits for it depends on the founder's answer to Q4 |
| Euro Plate web licence | M7 | existing `plate-text` Kanit fallback, checked in browser — not tested, presentation |
| Semantic colour sign-off | M7 | ship the derived palette already in `app/globals.css` |
| Icon library decision | resolved in M0 | lucide; §5.5 amended, no sign-off outstanding |
| Fee table / price | M7 | flat all-inclusive price per service, monthly reconciliation |
| Stripe live / Zulex production key | M8 | beta runs founder-owned vehicles first; public gate stays closed |
| Special plates (E/H/seasonal) | M6 | eligibility warns "may be rejected" |
| Zulex status-change webhook | M4 (route) | per-application polling with backoff is complete on its own; webhook only shortens latency |

## Deviations from skill rules (explicit)

1. **In-repo migration runner** instead of Supabase CLI migrations — CLI format incompatible with the skill's folder + `down.sql` layout.
2. **Shadcn files moved** from `components/`+`lib/` to `src/ui`+`src/lib` to satisfy `project-structure`; alternatively amend the skill.
3. **Design standard §5.5 amended** from Font Awesome to lucide — **done in M0**, not pending. Deviation and reasoning recorded inside §5.5 so it isn't later mistaken for drift.
4. **`.claude/` and `docs/` un-ignored** in M0 — `CLAUDE.md` calls them authoritative; CI and collaborators must see them.
5. **Five driver variables, not the three named in M1** — `REPOSITORY_DRIVER` and `STORAGE_DRIVER` added so "required only when switched on" has a switch for `DATABASE_URL` and `SUPABASE_STORAGE_*`. Otherwise: require a database URL on every deployed stage (blocking the M1 staging deploy until M3), or leave it optional forever (production could boot with no database). **Decided in M1.**
6. **`Clock` and `TokenGenerator` are real in every stage**, incl. dev, while vendor ports are wired per Deviation 9. No driver variable: no network, money or secret to fake away, and a frozen clock or predictable status link in a running dev server is a bug, not a convenience. Their fakes exist for tests, as `external-services` rule 4 requires. **Decided in M1**; reasoning recorded in `src/config/container.ts`.
7. **Two permanent branches, `staging` and `main`, instead of promoting a build** — each has a Vercel project; branch protection enforces the path: no direct push to either, CI required on both, `main` accepts PRs from `staging` only. Repo is public because protected branches are paid on private ones. `enforce_admins` on for both; no approving review required (`docs/provisioning.md` §4). **Decided after M1.**
8. **`test-driven-development` skill vs `CLAUDE.md`:** skill said "Always" for every feature and listed configuration as an approval-needing exception; `CLAUDE.md` scopes test-first to logic, behaviour, boundaries and fixes, excluding presentation and configuration outright. `CLAUDE.md` wins as the project instruction. **Resolved:** the skill's "When to Use" section now mirrors `CLAUDE.md`.

9. **Payment and registration are real in dev** (from M4), against the `external-services` default of a fake in dev: the test mode of the `G&M Gastro Event GmbH` Stripe account and the Zulex integration API, so vendor-specific code fails on a laptop rather than first on staging. Repository, document store and identity verification stay fake in dev, mail stays console. Per-stage wiring: decisions table, Adapters per stage. **Decided before M2.**

10. **The Postgres rate limiter lives in `src/adapters/repository/postgres/`**, not in a `rate-limit/` folder of its own: lint bars adapters from importing each other, and it shares the pool setup, the migrator and the test database with the repository. Its in-memory fake is in `src/adapters/rate-limit/fake/`. **Decided in M5.**
11. **`npm test` sets `NODE_OPTIONS=--experimental-vm-modules`.** React Email's renderer imports `react-dom/server` dynamically, which Jest's CommonJS VM allows only with that flag; a static import would fail in Next's server-component bundle. Run one file with `npm test -- path`, not `npx jest`. **Decided in M5.**

## Critical files (to create or change)

- `.gitignore`, `package.json`, `components.json` — M0
- `src/config/env.ts`, `src/config/container.ts`, `eslint.config.mjs`, `.env.example`, `.github/workflows/ci.yml`, `CONTRIBUTING.md`, `next.config.ts` — M1
- `src/core/domain/application/application-status.ts` (the machine everything derives from), `src/core/ports/*/*.ts` + `*.contract.ts`, `src/adapters/*/fake/` — M2
- `db/migrations/0001_…0004_*`, `db/seed/seed.ts`, `src/adapters/repository/postgres/` — M3
- `src/adapters/{registration/zulex,payment/stripe,mail/resend}/`, `src/core/use-cases/*/*.ts`, `src/core/domain/registration/poll-schedule.ts`, `app/(funnel)/deregister/`, `app/status/[token]/`, `app/api/internal/poll/route.ts`, `app/api/webhooks/stripe/route.ts`, `app/api/webhooks/zulex/route.ts` (if the webhook exists), `vercel.json`, `tests/integration/*.test.ts` — M4
- `src/adapters/storage/supabase/`, `src/adapters/mail/resend/{copy.ts,email-layout.tsx,render.tsx}`, `src/adapters/repository/postgres/postgres-rate-limiter.ts`, `src/core/ports/rate-limit/rate-limiter.ts`, `src/core/use-cases/status/{get-document-by-token,resend-status-link}.ts`, `app/status/[token]/`, `app/status/link-anfordern/`, `db/migrations/0005_create_rate_limits/`, `db/seed/data/documents.ts` — M5
- `src/adapters/identity/verimi/` (shape pending Q1–Q3) — M5, with Verimi
- `src/core/domain/registration/error-algorithm.ts`, `src/core/domain/payment/refund-policy.ts` — M2; `src/core/domain/registration/{failure,rejection-catalogue}.ts`, `src/core/domain/payment/hold-policy.ts`, `src/core/domain/application/correction.ts`, `src/core/use-cases/application/{cancel-application,correct-application}.ts`, `src/core/use-cases/payment/secure-hold.ts`, `app/status/[token]/{actions,order-change}.ts` and `_components/{cancel-order,correct-order}.tsx`, `db/migrations/0006_add_application_failure/`, `0007_index_applications_by_vehicle/`, `db/seed/data/payments.ts` — M6
- `db/migrations/0008_…0012_*`, `src/core/domain/application/{consent,new-registration-request,new-registration-correction}.ts`, `src/core/domain/payment/verification-policy.ts`, `src/core/use-cases/identity/`, `app/api/webhooks/identity/route.ts`, `app/(funnel)/register/` — Neuzulassung N1–N7 (`docs/registration-plan.md`)
- `docs/launch-plan.md` (this document), `docs/runbooks/` — M8

## Known defects (docs vs code audit, 2026-09-29)

Found on `main` @ `1ed5034`. Numbered D1–D11; D2, D3, D4, D5, D6, D7, D9 and D11 are fixed.

| # | Defect | Status |
|---|---|---|
| D1 | Nothing runs the poller: `vercel.json` has no `crons` | Deferred: off while the Zulex API is down |
| D2 | Email 6 (refund) is never sent | Fixed |
| D3 | A lapsed card hold loops forever | Fixed (provisional answer to Q20) |
| D4 | Zulex 401/403/404 on create loops forever | Fixed |
| D5 | Emails 4, 5a, 5b and 5c are lost if sending fails | Fixed |
| D6 | A create timeout ends in 5c with a full refund | Fixed (provisional answer to Q23) |
| D7 | Landing price ("ab 29,00 €") differs from checkout (69,99 €) | Fixed: both read the founder's price list (Q19) |
| D8 | Legal pages are wrong or missing | Parked (M7) |
| D9 | Consent (`agb_version`, `consent_at`) is never stored | Fixed (Neuzulassung plan N6) |
| D10 | Checked radio contrast is 2.31:1 | Planned |
| D11 | On staging, two Vercel instances can give two orders the same fake Zulex id | Fixed |

**Planned fixes** (test-first, one PR each into `staging`; D3, D4 and D6 moved to the fixed list below with M6):

- **D9 (fixed).** Checkout now stores what the customer ticked. `recordConsent` (`src/core/domain/application/consent.ts`) turns what the browser sent into `Application.consent` (`agbVersion`, `givenAt`, and for a Neuzulassung `powerOfAttorneyVersion`), `submitCheckout` refuses an order without every consent its service needs (`ConsentRequired`), and the repository writes `agb_version`, `consent_at` and the new `power_of_attorney_version` (migration `0012_record_consent`, whose check refuses a version without a time). The versions are `LEGAL_TEXT_VERSIONS`, `draft-1` until the lawyer's texts replace the placeholders (Q13, Q46); orders made before it have no consent, staging's rows seeded earlier among them (the seed leaves an existing row as it is; the orders it adds now carry one).
- **D10.** `src/ui/radio-group.tsx` draws an orange dot and border on white; `docs/design-standard.md` requires an orange fill with a grau-dark mark. Presentation: checked in the browser, not tested.
- **D2 (fixed).** A held card fires no `charge.refunded` (a release fires `payment_intent.canceled`, a fee-only capture `charge.captured`), and the webhook acts only on "payment ready", so email 6 was never sent. `handleFailure` now sends it right after the money is returned, under the key `confirmRefund` uses, so the provider's confirmation adds nothing and no new Stripe webhook event is needed.
- **D5 (fixed).** Emails 4, 5a, 5b and 5c went out after the status was saved. Each now goes out first, keyed by its transition, so a failed send leaves the application at its old status, backed off like any other failure after the service answered (a minute, then the online poll table), and a later poll sends it. To make that rerun safe, settlement recognises what it already did (`settledDecision`) and `submitToKba` finishes a failure instead of filing an application whose payment was released. A mailer that fails for good now holds an application at its old status instead of dropping the email (Q33); the poll log names the order and the kind of error each time it does. Zulex's application id is stored before email 4 is sent, so a failed email never makes the next tick file the application again (Q23: a replay's answer is unspecified).
- **D3 (fixed).** `settlePayment` threw `HoldExpired` before the status was written, so a lapsed hold was re-polled every tick and nothing read `holdExpiresAt`. A hand-processed order's hold is now checked on every poll and a 5b is polled daily for its money; a hold inside 48 hours of lapsing is captured in full (`src/core/domain/payment/hold-policy.ts`, `secure-hold.ts`). A hold that lapsed anyway settles as "nothing to take or return" (`settledDecision`): the order ends as the KBA decided and the loss is ours. Provisional answer to Q20.
- **D4 (fixed).** `ZulexRequestFailed` on create was rethrown without rescheduling, so it was retried every minute for ever. Any submission failure is now rescheduled first, with the online backoff; an unexpected error is then rethrown so the poll log names it, and after 24 hours the order fails for good with a full refund (`submit-to-kba.ts`).
- **D6 (fixed).** A timeout on create counted as "never reached Zulex" and ended in 5c with a full refund after one retry, though the create may have succeeded. It is now resubmitted under the same idempotency key for 24 hours (`SUBMISSION_PATIENCE_MS` in `error-algorithm.ts`); only a 400 is known to have filed nothing. Provisional answer to Q23; Q40 asks who checks Zulex for a stray application after the 24 hours.
- **D11 (fixed).** The fake registration gateway numbered its ids `fake-zulex-application-1`, `-2`, … per instance, and `applications.zulex_application_id` is `UNIQUE`, so the second order to draw a taken id failed to record it and stayed at status 1; a status check on an instance that had not filed the application threw. The fake now derives the id from the submission's idempotency key (hashed), so different orders get different ids and a retry on another instance gets the same one, and it reports an application it never filed as in progress. Production is unaffected: it refuses every fake driver.

## Open questions (business logic v1.0)

Nothing below is decided here. Numbers are stable — milestones refer to them. Where the code needed an answer to move on, it carries a provisional one, marked **Provisional answer in code**, until the founder confirms or overrules it.

**Which answers are needed first:**

| Priority | Questions | Why |
|---|---|---|
| 1 — blocks the M4 walking skeleton | Q5, Q6 | M4 is critical-path; can't run end to end without knowing when Zulex is called and what starts the application. |
| 2 — blocks the status model in M2/M3 | Q1–Q4, Q7, Q8, Q9, Q18 | Status list, error algorithm and refund function are built in M2 and encoded in the M3 schema. |
| 3 — blocks launch, not the skeleton | Q10–Q16, Q19–Q44 | Needed for M5–M7; earlier work proceeds on fakes and placeholders. |
| 4 — non-blocking | Q17 | A placeholder processing time can ship and be replaced. |
| 5 — Neuzulassung only | Q45–Q56 | Not needed for the de-registration launch. Q45, Q46, Q50 and Q56 shape the Neuzulassung plan first (`docs/registration-plan.md`). |

**Identity verification (Verimi)**

1. **Who integrates Verimi?** ZulexGO calling Verimi directly, or the Zulex backend running the Verimi step? Zulex API spec has no Verimi field, endpoint or status.
   **Blocks:** M5 (Verimi adapter, `IDENTITY_DRIVER` credentials), M7 (privacy policy and data processing agreement).
   **Provisional answer in code (not approved by the founder):** ZulexGO runs the verification itself, behind the `IdentityVerification` port (`src/core/ports/identity/`); a Neuzulassung goes through it (Q45). Only the fake adapter exists: no Verimi adapter is written, because no source for Verimi's API is confirmed, and the Zulex API has no verification step.
   **If the founder answers differently:** if Zulex runs the verification, the adapter is a Zulex-backed implementation of the same port (registration plan N5).
2. **Who sends email 2 and where does the Verimi link come from?** Document lists it among emails ZulexGO sends via Resend, but ZulexGO can't create the link unless it integrates Verimi itself.
   **Blocks:** M5 (email 2).
   **Provisional answer in code (not approved by the founder):** ZulexGO sends email 2 (`identityVerificationRequested`) through the mailer, carrying the link the provider's `start` returns (the fake returns a placeholder), and a reminder (`identityVerificationReminder`, Q48).
3. **How does ZulexGO learn verification succeeded or failed?** Verimi callback, Zulex status, or polling? Zulex exposes only `IN_PROGRESS | FINISHED | ERROR`.
   **Blocks:** M2 (event behind the 2 → 3 transition; placeholder until answered), M5 (the transition itself), M6 ("identity verification failed → 5c").
   **Provisional answer in code (not approved by the founder):** the poller reads the result (`getResult`) of every order at status 2. The provider's signed callback at `/api/webhooks/identity` (header `x-identity-signature`, a name of ours until a provider is chosen) only triggers the same read: a callback never carries an outcome that is acted on (`readNotification`).
4. **Does de-registration need Verimi at all?** De-registration request carries no owner data, and under i-Kfz the scratched security codes are the proof of possession. Several document examples (eVB, plate shipping, owner address) come from registration services.
   **Blocks:** M2 (seven or five statuses), M3 (status column), M5 (stepper, emails 2 and 3), M7 (whether the privacy policy covers ID and selfie data).
   **Provisional answer in code (not approved by the founder):** de-registration runs without Verimi, 1 → 4 (`DIRECT_SERVICES` in `application-status.ts`, `src/core/use-cases/payment/confirm-payment.ts`); every other service verifies first (Q45). Whether the de-registration launch waits for it is still open.
14. **Verimi deadline:** email 2 names a deadline. How long, is there a reminder, and what happens when it passes (5c with 19.99 € retained, or full refund)?
   **Blocks:** M5 (email 2 content), M6 (expiry outcome and its refund).
   **Provisional answer in code (not approved by the founder):** see Q48: a reminder after 2 days, a deadline after 4, and nothing was filed when it passes, so the order is cancelled with everything back, not 5c. It applies to a Neuzulassung only, since de-registration does not verify (Q4).

**Submission to Zulex and the KBA**

5. **When is the application "handed over to the Zulex API"?** Step 1 (after payment) or step 3 (after verification)? Per the spec, a create call at step 1 would submit to the KBA immediately, contradicting step 4 coming after step 3.
   **Blocks:** M2 (status transitions), M4 (which use case calls Zulex — skeleton can't run end to end without it).
   **Provisional answer in code (not approved by the founder):** step 1, right after payment (`src/core/use-cases/registration/submit-to-kba.ts`). A service that verifies the customer's identity first (Neuzulassung) is filed after status 3 instead (Q45).

**Payment and capture**

6. **Which Stripe event starts the application?** Document says `payment_intent.succeeded`. Verified in Stripe's docs: under manual capture, completing payment fires `payment_intent.amount_capturable_updated` and moves the PaymentIntent to `requires_capture`; `payment_intent.succeeded` fires only on capture. For SEPA Direct Debit, `payment_intent.processing` fires on submission, `payment_intent.succeeded` only when the debit settles. Listening to `payment_intent.succeeded` alone would never start a held card payment.
   **Blocks:** M4 (Stripe webhook wiring — skeleton can't run end to end without it).
   **Answer in code (Stripe's behaviour, needs no founder input):** `payment_intent.amount_capturable_updated` (held card) or `payment_intent.succeeded` starts the application (`src/adapters/payment/stripe/map.ts`); on `payment_failed` the customer stays on the payment step with Stripe's message.
7. **When exactly is a manual-capture payment captured?** Section 4 prefers manual capture, "captured when the application is confirmed" — could mean status 1, 3, 4 or 5a. But section 1 describes status 1 as "Payment has been successfully captured via Stripe", labelled "Payment captured". Under manual capture a card payment at status 1 is only authorised, so either that label and email 1 say "authorised", or capture happens at status 1. Verified in Stripe's docs: online, customer-initiated card authorisation valid 7 days on Visa and Mastercard, then funds released and PaymentIntent cancelled. Extended authorisation up to 30 days exists only on IC+ pricing; Visa charges extra 0.08 % per transaction outside travel and rental categories. A Verimi wait plus a manual-processing authority can exceed 7 days.
   **Blocks:** M4 (capture call in Stripe adapter), M5 (status 1 label and email 1 wording), M6 (hold policy), M8 ("hold expiring" runbook).
   **Provisional answer in code (not approved by the founder):** the card is held at checkout. An online authority's order is captured in full once Zulex accepts the application; a hand-processed order stays held until the KBA answers and is captured in full two days before the hold would lapse if it has not (Q20); anything still held when the KBA finishes is captured then (`captureHold` in `src/core/use-cases/registration/submit-to-kba.ts`, `guardHold` in `src/core/use-cases/registration/advance-status.ts`, both in `src/core/use-cases/payment/secure-hold.ts`). Status 1 and email 1 say the payment was received and when the card is charged (once the application is submitted, at the latest shortly before the card reservation ends), and that a failed application is refunded, possibly minus the fee.
   **If the founder answers differently:** capture right after payment for every authority: call `captureHold` in `src/core/use-cases/payment/confirm-payment.ts` before `submitToKba`, and drop the `ikfzStatus === "online"` condition in `submit-to-kba.ts`. Capture only at 5a for every authority: remove the `captureHold` call in `submit-to-kba.ts`, and let `advance-status.ts` run `guardHold` for online orders too (today it skips them). Either way update `tests/integration/hold-policy.test.ts`, and the status 1 label and email 1 wording if "paid" becomes "authorised".
8. **How is "refund minus 19.99 €" executed when the payment was only authorised?** Verified in Stripe's docs, both possible: partial capture of 19.99 € automatically releases the rest, or full capture then partial refund. Most payments allow only one capture, so partial capture is final. Customer sees a different bank statement in each case — a business choice.
   **Blocks:** M2 (Stripe action returned by `refund-policy.ts`), M3 (payment columns), M6 (refund execution).
   **Provisional answer in code (not approved by the founder):** on a held card capture only the 19.99 € fee, which releases the rest; on a captured payment refund the rest (`src/core/domain/payment/refund-policy.ts`). Most orders are captured by then (Q7), so the refund is the usual path.
   **If the founder answers differently:** to always capture in full and refund, change the `held` branch of `retainFee` in `refund-policy.ts` to a full capture followed by a refund of total minus the fee, and its rows in `refund-policy.test.ts` and `tests/integration/correction-and-cancellation.test.ts`.
12. **SEPA Direct Debit timing:** verified in Stripe's docs, SEPA Direct Debit has no manual capture and is a delayed-notification method: charged at checkout, `processing` for several business days before `succeeded` or `payment_failed`. Does a SEPA order start its application at `processing` and risk a later failed debit, or wait days for `succeeded`? Refund-relevant: SEPA refunds possible for 180 days; a customer can dispute a SEPA debit with their bank for up to 13 months with no appeal, so a refunded SEPA payment can still be disputed.
   **Blocks:** M4 (payment methods offered and webhook handling), M6 (refunds and disputes on SEPA orders).
   **Provisional answer in code (not approved by the founder):** no SEPA; cards only, Apple Pay and Google Pay as card wallets (`src/adapters/payment/stripe/stripe-payment-provider.ts`).
15. **Stripe Customer object:** document says store the Stripe Customer ID. Customer created per order or reused per email address, given no accounts?
   **Blocks:** M3 (payments table), M4 (Stripe adapter).
   **Provisional answer in code (not approved by the founder):** no Customer is created; the order reference is the only link. `payments.stripe_customer_id` stays empty.
16. **`customer_email` in Stripe metadata:** OK to duplicate the email into Stripe under the GDPR minimisation rule? Already held on the Customer object.
   **Blocks:** M4 (PaymentIntent metadata), M7 (privacy policy).
   **Provisional answer in code (not approved by the founder):** no; metadata is `order_id`, `service_type` and, once Zulex accepts the application, `application_id`.

**Errors, corrections and refunds**

9. **What counts as a "technical error on our side" (100 % refund) vs a "technical API error" (5b, correctable)?** The two rows overlap.
   **Blocks:** M2 (error algorithm), M6 (refund amount for technical failures).
   **Provisional answer in code (not approved by the founder):** a submission that still cannot be confirmed after 24 hours of silent resubmission counts as our side: 5c with a full refund (`SUBMISSION_PATIENCE_MS` in `src/core/domain/registration/error-algorithm.ts`). A KBA error the catalogue does not know gets one silent retry, then 5b.
10. **Which de-registration failures are correctable and which not?** E.g. wrong security code, VIN mismatch, already-used plate seals. Document's examples don't cover de-registration.
   **Blocks:** M5 (content of emails 5b and 5c), M6 (rejection catalogue).
   **Provisional answer in code (not approved by the founder):** the catalogue is empty (`REJECTION_CATALOGUE` in `src/core/domain/registration/rejection-catalogue.ts`): every 400 on the first submission attempt (Q23) and every `REJECTION` document → 5b; an unknown KBA code → one silent retry, then 5b. Nothing reaches 5c from a KBA error until the catalogue lists it as final. Every unknown code reads with one general wording for the customer, and the log warns once per occurrence.
   **If the founder gives the codes:** add one entry per code, `{ class: "technical" | "correctable" | "final", reason: "<German wording for the customer>" }`, to `REJECTION_CATALOGUE`, with a test in `src/core/domain/registration/rejection-catalogue.test.ts` or `error-algorithm.test.ts`. Nothing else changes: the algorithm, the status page and emails 5b and 5c read the table.
11. **Can a correction ever cost more for de-registration?** If not, the "pay the difference" PaymentIntent isn't needed for the MVP.
   **Blocks:** M6 (5b option A).
   **Provisional answer in code (not approved by the founder):** no; `src/core/use-cases/payment/settle-payment.ts` throws if a correction would cost more, and the status page and email 5b say the correction costs nothing extra.
   **If the founder answers differently:** a correction that can cost more needs a second PaymentIntent (`PaymentProvider.createPayment` again), a payment step in `CorrectOrder` (`app/status/[token]/_components/correct-order.tsx`) before `correctApplication` patches, the `chargeAdditional` branch in `settle-payment.ts`, and the copy in `status-view.tsx` and `src/adapters/mail/resend/copy.ts` (then a new reviewed snapshot).
18. **Scope of the automatic retry:** core principle says a second attempt is "ALWAYS" made before notifying or refunding, but step 1 limits the retry to technical errors. Does a KBA data rejection (e.g. wrong security code) also get retried once, though the same data would fail again?
   **Blocks:** M2 (error algorithm), M6 (retry behaviour).
   **Provisional answer in code (not approved by the founder):** no; a data rejection (a 400 on the first submission attempt, or a rejection document) goes straight to 5b. The one silent retry is per submission, so an application resubmitted after a technical error still gets one for a later KBA error.

**Legal**

13. **Right of withdrawal vs the 19.99 € fee:** can a consumer withdrawing within 14 days be charged the fee, and does ZulexGO still need the immediate-performance waiver? Needs the lawyer.
   **Blocks:** M4 (consent checkboxes at checkout), M7 (AGB fee clause).
   **Provisional answer in code (not approved by the founder):** two mandatory checkboxes at checkout: "Ich akzeptiere die AGB und habe die Widerrufsbelehrung gelesen", and the immediate-performance waiver ("verlange ausdrücklich … vor Ablauf der Widerrufsfrist … Widerrufsrecht erlischt, sobald vollständig ausgeführt"). No fee rule on withdrawal. The consents are stored with the order (D9), and a Neuzulassung adds a third (Q46).

**Emails**

17. **Email 4's "expected processing time":** fixed figure per authority status, or returned by the Zulex API?
   **Blocks:** nothing — M5 ships a placeholder per authority status until answered.
   **Provisional answer in code (not approved by the founder):** email 4 says "meist in wenigen Minuten bis Stunden erledigt" for an online authority and "kann einige Tage dauern" otherwise, the same two expectations shown before payment (`src/adapters/mail/resend/copy.ts`, `app/(funnel)/deregister/_components/availability-notice.tsx`).

**Added 2026-09-29 (docs vs code audit)**

19. **Price and VAT:** the founder's price list (September 2026) fixes the prices: Neuzulassung 129 €, Wiederzulassung 99 €, Ummeldung 99 €, Abmeldung 49 €, Adressänderung 99 €, the same for one plate or two, with the 19.99 € processing fee inside the price and not on top of it. Still open: are these prices gross of VAT, is the authority fee passed through or subject to VAT, and does the customer get a Rechnung?
   **Blocks:** M7 (PAngV price display, invoice).
   **Provisional answer in code (not approved by the founder):** the prices are shown as final prices "inkl. Behördengebühr und MwSt." (`src/core/domain/payment/pricing.ts`, read by the landing page and the checkout); no invoice is issued.
   **If the founder answers differently:** change the VAT wording in `app/(funnel)/deregister/_components/review-step.tsx`, `app/(funnel)/register/_components/review-step.tsx`, `app/_components/service-selection.tsx` and `app/_components/faq.tsx`; an invoice is a new email template and document, not a pricing change.
20. **Hold lapse:** a card hold lasts 7 days; with capture at `FINISHED`, manual-processing authorities and a 5b waiting on the customer, it can lapse first. Capture earlier, email a re-authorisation request, or absorb the loss?
   **Blocks:** M6 (hold policy), Known defects D3 (fixed with this provisional answer).
   **Provisional answer in code (not approved by the founder; the safest of the options, chosen because the founder has not answered):** capture in full ahead of expiry. A hand-processed order's hold is checked on every poll, and a 5b is polled daily for its money; a hold inside 48 hours of lapsing is captured in full (`HOLD_CAPTURE_MARGIN_MS` in `src/core/domain/payment/hold-policy.ts`), so nothing lapses and the customer does nothing. A captured payment refunds like a held one is settled (total minus the fee on a failure). A hold that lapsed anyway (the poller down for days) ends the order as the KBA decided, with nothing kept: a finished order is completed unpaid, a failed one returns everything, the log names the order, the loss is ours. Any `canceled` PaymentIntent reads this way whatever the cause (a lapse, a cancel in the Stripe dashboard, an issuer void), and only a log line says so. A 5b that existed before M6 (only staging's seed) has no daily look at its money.
   **If the founder answers differently:** (a) *email a re-authorisation request, as the plan assumed:* add an email template beside `EmailTemplate` in `src/core/ports/mail/mailer.ts` and its German copy in `src/adapters/mail/resend/copy.ts` (a reviewed snapshot), a page and server action under `app/status/[token]/` that create a second PaymentIntent (`PaymentProvider.createPayment`) and swap `application.payment.id` with `repository.update` (Postgres already writes it), release the old hold, and decide what happens when the customer does not answer (Q21). In `secure-hold.ts` replace the capture in `guardHold` with sending that email once. (b) *absorb the loss:* remove `guardHold` from `advance-status.ts` and `watchHold`; `POLLED_STATUSES` then no longer needs `failed_correctable`, nor `handleFailure` the daily `nextPollAt` it gives a 5b. (c) *a different margin:* change `HOLD_CAPTURE_MARGIN_MS` (keep it at least twice `HOLD_CHECK_INTERVAL_MS`; a test enforces that).
21. **5b deadline:** if the customer neither corrects nor cancels, when does the order auto-cancel, and with what refund?
   **Blocks:** M6 (5b options).
   **Provisional answer in code:** none; a 5b waits for ever. Its money is safe (captured ahead of expiry, Q20), but the order never closes and nothing tells the customer.
   **If the founder answers:** `watchHold` in `src/core/use-cases/registration/advance-status.ts` already visits every 5b daily. Add the deadline there: after N days call the cancel path (`cancelApplication` is by token today; extract its settle-and-email core, keyed by reference) and send email 6, with a test in `tests/integration/cancel-application.test.ts`. If the 5b's polling should also stop, the daily visit keeps until the payment is captured or released.
22. **Retention:** how long are security codes, VIN, plate, email, confirmation PDFs, the status link after a terminal state, and abandoned unpaid checkouts kept?
   **Blocks:** M7 (retention cron, privacy policy).
   **Provisional answer in code:** nothing is deleted on a schedule, with one exception: a Neuzulassung's bank account goes the moment its order ends (Q54). Codes and tokens, and a Neuzulassung's owner and bank data, are encrypted; email, VIN and plate are plain text; the status link never expires; abandoned checkouts are kept, with everything the customer typed, a Neuzulassung's IBAN included.
   **If the founder answers differently:** a retention job is a new use case run by the poll route, with its periods in a domain policy beside `hold-policy.ts`. It needs `ApplicationRepository` to find ended orders by when they last changed (a contract case, both adapters) and to clear or delete them. Abandoned checkouts also need their payment voided first (`PaymentProvider`), so that a customer who pays late does not pay for an order that no longer exists. The documents' own retention is the `DocumentStore`'s.
23. **Zulex provider questions:** does a replayed `X-Idempotency-Key` return the same `applicationId`, and for how long? Is a rejection `ERROR` or `FINISHED` + `REJECTION`? Are E, H and seasonal plates supported? What does Zulex charge per application? When is the API back?
   **Blocks:** M4 (staging run), M6 (Known defects D6, special plates).
   **Provisional answer in code (not approved by the founder):** one random idempotency key per checkout, assumed honoured on replay; a create that cannot be confirmed (timeout, 429, 5xx, 409, an answer we cannot read, a 401, 403 or 404) is resubmitted under the same key on the online backoff for 24 hours, then fails for good with a full refund (`SUBMISSION_PATIENCE_MS`, D4 and D6); a 400 on the first attempt goes straight to 5b, but a 400 answering a retry is treated as one more unconfirmed try, since it says nothing about the attempt before it; both rejection shapes handled; 15 s timeout; special plates not flagged in the request; `reserveLicencePlate` always `false`; a correction that files an order afresh takes a new key (Q37).
   **If the founder answers differently:** if a replayed key is answered with a 400 when the first attempt was accepted, `toFailure` in `submit-to-kba.ts` is what keeps that from filing a second application; if a replayed key does *not* return the same application, the 24-hour resubmission can file twice; shorten `SUBMISSION_PATIENCE_MS` or stop resubmitting and refund at once (`decideOnFailure` in `error-algorithm.ts`, tests in `error-algorithm.test.ts` and `tests/integration/deregistration-flow.test.ts`). If a rejection is `ERROR` only, or `FINISHED` + `REJECTION` only, drop the other branch of `failureOf` in `advance-status.ts`. The 15 s timeout is `TIMEOUT_MS` in `src/adapters/registration/zulex/http.ts`.
24. **Applicant:** may someone other than the vehicle keeper order (the PRD's "Jonas" helper)?
   **Blocks:** M7 (AGB), Q4.
   **Provisional answer in code:** no applicant data collected; whoever has the codes can order. Email 1 says the link is "nur für Sie bestimmt … nicht weitergeben", against the PRD persona's shareable link.
25. **Mistyped email:** the status link goes only to the stored address. How does such a customer recover?
   **Blocks:** M5 (resend flow, support process).
   **Provisional answer in code:** "Resend my link" (`/status/link-anfordern`) takes a reference and an email and mails a new link to the stored address only, so a customer who mistyped the address at checkout gets nothing and has no way back; the status pages show `kontakt@gm-gastro.com`.
26. **Correction scope at 5b:** only the security codes, or plate and VIN too? A different vehicle would be a new order.
   **Blocks:** M6 (5b option A).
   **Provisional answer in code (not approved by the founder):** the VIN and the three security codes can be corrected (the front code only on a two-plate order); the plate cannot, since a different plate is a different vehicle and so a new order (`parseCorrection` in `src/core/domain/application/correction.ts`). Blank fields stay as they were; the form starts empty, so no stored code is put back on the page.
   **If the founder answers differently:** to correct the plate too, add `licencePlate` to `CorrectionInput`, `parseCorrection` and `applyCorrection` (the `Correction` port type and the Zulex adapter's `correct` already carry it), a plate field group to `app/status/[token]/_components/correct-order.tsx`, and tests in `correction.test.ts` and `tests/integration/correct-application.test.ts`. To prefill VIN and plate instead of starting empty (site-contract §2.6 asked for it), pass them from `StatusView`; the codes stay empty either way.
27. **Support and alerts:** who receives operational alerts (unknown error codes, lapsed holds, failed refunds) and handles disputes and chargebacks?
   **Blocks:** M6 (unknown-code fallback alert), M8 (monitoring, runbooks).
   **Provisional answer in code:** none; an alert is a log line, named by order and kind and never carrying a code: `[error-algorithm]` (an unknown KBA code; a failure that ended in a full refund, with a note to check the Zulex portal for a stray application), `[payments]` (a hold that lapsed, a hold check that failed), `[identity]` (a verification that could not start) and `[poll]`. `kontakt@gm-gastro.com` is the only contact shown.
   **If the founder names a channel:** add an alerts port (`src/core/ports/`, one fake, one adapter) and call it where those lines are logged: `handle-failure.ts`, `secure-hold.ts`, `settle-payment.ts`, `start-identity-verification.ts`, `poll-due-applications.ts`.

**Added 2026-09-29 (M5)**

28. **Which documents does the customer see?** The status page lists every document stored for a finished order, and the site contract names confirmation, fee statement, rejection and unknown. Is the fee statement (`FEE`, the authority's charge, which shows what Zulex paid) meant for the customer? Should a rejection document be kept and shown at 5b and 5c?
   **Blocks:** M5 (documents list), M6 (5b/5c pages).
   **Provisional answer in code (not approved by the founder):** documents are stored only when an order completes, all of them, and all are listed, the confirmation first; nothing is stored for a failure. An order Zulex reports finished with no document at all is completed anyway and never polled again.
29. **Email 5a and the PDF:** attach the confirmation to the email, or only link to the status page?
   **Blocks:** M5 (email 5a).
   **Provisional answer in code (not approved by the founder):** link only. An attachment would put the plate and other order data into the customer's mailbox, and the link keeps the document behind the token check.
30. **"Kfz-Steuer und Versicherung enden automatisch":** the status page says so at 5a. Is that correct for every case, or does the customer still have to tell their insurer?
   **Blocks:** M5 (status page copy), M7 (legal review).
   **Provisional answer in code (not approved by the founder):** the sentence stays on the status page; the email does not repeat it.
31. **Who signs off the German wording?** The customer emails (`src/adapters/mail/resend/copy.ts`) and the status page are translated by us from an English document. Do the emails also need the company name and address in a footer, as the site's footer has?
   **Blocks:** M5 (emails), M7 (legal).
   **Provisional answer in code:** the reviewed HTML snapshots in `src/adapters/mail/resend/__snapshots__/` are the artefact to review; no company name or address in the emails, only the support address. The M6 wording is ours too and unreviewed: the general reasons in `src/core/domain/registration/rejection-catalogue.ts`, the correction form and cancel dialog on the status page, and the 5b email's new text.
32. **A customer at 5b before M6 exists:** *closed by M6.* The page and email 5b now offer correcting and cancelling; a mail to support is no longer the way. The question stays so the number does not move.
   **Blocks:** nothing.
   **Provisional answer in code:** correct and cancel are built (M6); the status page still shows `kontakt@gm-gastro.com` for questions.
33. **An address that cannot receive mail:** a status email is now sent before the status is saved, so an address the mailer keeps refusing holds its application at the old status, retried on a backoff (a minute, then the online poll table), and a held card may lapse meanwhile. How long do we wait for the email before going on without it?
   **Blocks:** M6 (hold policy, Q20), M8 (stuck-application alert).
   **Provisional answer in code:** we wait for ever. For email 4, which is sent as the application is filed, each failed try now backs off (a minute, then the online poll table); so does a failure of a later email, of storing a document or of settling the money, so one failing order cannot keep the front of the queue. The repeat of email 4 after a correction is not waited for: a failure is logged and the order goes on.
34. **Resending a link:** a resend revokes the old link, so a link in an earlier email stops working; one address may ask 5 times an hour and one order 3 times an hour. Right, or should the old link keep working?
   **Blocks:** M5 (resend flow), M7 (threat model).
   **Provisional answer in code (not approved by the founder):** the old link is revoked, with the limits above. Two consequences: anyone who knows an order's reference can use up its three requests an hour and keep the real customer's request from being served, and on staging anyone who reads the repo can rotate the seeded links (a redeploy restores them).

**Added 2026-09-30 (M6)**

35. **When does email 6 go out?** The plan says "on `charge.refunded`". A held card fires no `charge.refunded` (a release fires `payment_intent.canceled`, a fee-only capture `charge.captured`), so D2's fix sends email 6 right after we have asked Stripe to return the money, under the key `confirmRefund` would use. For a captured payment Stripe does fire `charge.refunded`, but the staging webhook endpoint is subscribed to two events only, and `confirmRefund` is not wired to a route. Should email 6 wait for Stripe's confirmation, at least for money that goes back by refund?
   **Blocks:** M6 exit criterion ("email 6 only after `charge.refunded`"), M8 (webhook set-up).
   **Provisional answer in code (not approved by the founder):** email 6 goes out once the provider has accepted the refund or the release, for every payment (`handleFailure`, `cancelApplication`); a provider event adds nothing.
   **If the founder answers differently:** subscribe the Stripe webhook endpoint (`docs/provisioning.md` §8) to `charge.refunded`, map it in `src/adapters/payment/stripe/map.ts` to a new `PaymentNotification` kind, call `confirmRefund` (exists in `src/core/use-cases/payment/confirm-refund.ts`) from `app/api/webhooks/stripe/handle.ts`, and stop calling `mailRefund` in `handle-failure.ts`, `cancel-application.ts` and `check-identity-verification.ts` for a captured payment (keep it for a released hold, which fires no `charge.refunded`).
36. **Our own record of the money:** should ZulexGO keep captured, refunded and retained amounts itself, or is Stripe the only record? Migration `0002` has the three columns ("written from M6"); nothing writes them.
   **Blocks:** M7 (`audit_log`), M8 (daily reconciliation).
   **Provisional answer in code (not approved by the founder):** Stripe is the only record. `payments.captured_cents`, `refunded_cents` and `retained_fee_cents` stay empty; the status page and email 6 read the amounts from the provider (`getPayment`), so there is no second copy that can drift.
   **If the founder answers differently:** after each `settlePayment` and `captureHold` write the amounts through a new `ApplicationRepository` method (a contract case, both adapters, `Application.payment` gaining the fields); the M4 test that no other Stripe payment field reaches the repository still holds, since these are our amounts.
37. **Correcting an order the service refused outright (a 400 at submission):** Zulex holds nothing to patch. Its 400 says "fix the data and resubmit a new request". Does it accept a new idempotency key for the same vehicle after a 400, and should the customer's attempts be limited?
   **Blocks:** M6 (5b option A).
   **Provisional answer in code (not approved by the founder):** the corrected order is filed afresh under a new idempotency key and returns to status 1, then 4; refused again, it is back at 5b with email 5b again. Attempts share the limit of 10 an hour per address with cancelling (`RATE_LIMITS.orderChange`).
   **If the founder answers differently:** `refile` in `src/core/use-cases/application/correct-application.ts`, the `correctionRefiled` event in `src/core/domain/application/application-status.ts`, and the repository's `update`, which now writes `idempotency_key`. To make it a new order with its own payment instead, replace the form with a cancel and a link to `/deregister`.
38. **A second order for a vehicle that already has one (J8):** warn or block? And is it right to tell whoever types a plate and VIN that an order is open?
   **Blocks:** M7 (threat model), Q24.
   **Provisional answer in code (not approved by the founder):** a warning the customer continues past with a checkbox. The answer says only that an order is open, never its reference or status. An unpaid checkout, a finished, failed or cancelled order does not count. Two checkouts racing can both pass, since it is not a lock. A Neuzulassung's checkout is limited to 10 attempts an hour per address (`RATE_LIMITS.checkout`, N8), which bounds probing it with guessed VINs; de-registration's checkout is not rate limited until M7.
   **If the founder answers differently:** to block, drop `acknowledgedDuplicate` from `src/core/use-cases/checkout/submit-checkout.ts` and the checkbox in `app/(funnel)/_components/checkout-panel.tsx`; to count more statuses, change `OPEN_STATUSES` in `src/core/domain/application/application-status.ts`.
39. **Special plates (J11):** how should a customer with an E, H or seasonal plate be treated? The plate field takes digits only, and a de-registration request has no field for the suffix.
   **Blocks:** M6 (eligibility), Q23.
   **Provisional answer in code (not approved by the founder):** a checkbox in the eligibility step shows a warning that the application may be rejected; the customer can go on; nothing about it is sent to Zulex.
   **If the founder answers differently:** to turn such customers away, disable "Weiter" while the box is ticked in `app/(funnel)/deregister/_components/eligibility-step.tsx` and point to the authority in person (as the missing-documents notice does); to accept the suffix in the plate, extend `licencePlateSchema` in `src/core/domain/vehicle/licence-plate.ts` and the plate fields once the provider says how it is sent.
40. **After 24 hours without an answer from Zulex, who checks for a stray application?** The order is refunded in full, but Zulex may hold an application under its idempotency key, which the KBA would process for a vehicle nobody paid for.
   **Blocks:** M8 (runbook "Zulex outage"), Q27.
   **Provisional answer in code:** the log names the order and asks support to check the Zulex portal; nothing else is done.
   **If the founder answers differently:** write the check into the runbook (`docs/runbooks/`), and give it an alert (Q27).

**Added 2026-10-01 (the founder's price list)**

41. **Plates, fine-dust sticker and shipping: who supplies them, and how are they paid for?** The price list prices them (plate 12,50 € each, carbon +4,00 € per plate, sticker 9,99 €, shipping 4,95 € with plates only) and requires that they are ordered and charged only after the KBA has completed the service, and not at all if it rejects it. A card hold is captured once, so they cannot ride on the service's payment: they need a second payment after completion (the customer pays again, or a saved card is charged without them present, which needs their consent). Also open: who makes and ships the plates, and whether they ship to the customer directly or via us; how the order reaches the supplier (an API, a web form, an email) and what it must contain (plate text and type, the delivery address); where the delivery address is collected and how long it is kept; the delivery time we may promise, and who handles a misprinted or lost plate; and which services offer them (a de-registration has no use for plates or a sticker).
   **Blocks:** the registration services, none of which is sold yet. Nothing in the MVP.
   **Provisional answer in code (not approved by the founder):** nothing is sold. `quote()` in `src/core/domain/payment/pricing.ts` already splits a basket into what is charged at checkout (the service, never an add-on) and what is due after completion, and its tests pin the founder's scenario totals. The landing page lists the add-on prices as "bald verfügbar" and states the rule. The only live service, de-registration, offers no add-ons.
   **If the founder answers differently:** (a) *sell them with a service:* put a basket in the review step and `submit-checkout.ts` (the payment keeps opening for `quote(...).atCheckout`), store it on `Application` (a migration, both repositories, the seed), and from `complete()` in `advance-status.ts` open the second payment for `afterCompletion`; on 5b, 5c and cancellation drop the basket unpaid, so `refund-policy.ts` needs no new row. (b) *a supplier:* a port per `external-services`, called after that payment, never from the checkout. (c) *a supplier receives the customer's name and address:* name it in the privacy policy and sign a data processing agreement before launch (D8, M7).
42. **THG-Quote through carbonify.de:** the price list offers electric-vehicle owners the THG-Quote, free for the customer. How is the customer handed over (a link with our partner identifier, an API), after which service, and what do we store about it?
   **Blocks:** nothing in the MVP.
   **Provisional answer in code (not approved by the founder):** not offered, and not mentioned on the site, since there is no hand-over to carbonify.de yet.
   **If the founder answers differently:** a link on the confirmation page and in email 5a, or a port per `external-services` if carbonify.de has an API; the price stays unaffected, since the quota costs the customer nothing.
43. **When do the other services launch, and in which order?** The landing page shows Neuzulassung, Wiederzulassung, Ummeldung and Adressänderung with their prices as "Bald verfügbar". The add-ons (Q41) and the THG-Quote (Q42) belong to them, so their answers wait on this one.
   **Blocks:** nothing in the MVP.
   **Provisional answer in code (not approved by the founder):** only de-registration is sold: `SERVICES_ON_SALE` in `src/core/domain/application/service.ts` lists it alone, the landing cards read the list (the other cards are visible and disabled), and `submitCheckout` refuses a service that is not on it. Neuzulassung is built (request, Zulex adapter, identity step, funnel, status page, emails) and not sold: `/register` is not found until it is on the list.
   **If the founder answers differently:** each service needs its own request type beside `DeregistrationRequest` and `NewRegistrationRequest` in `src/core/domain/application/` (a member of `ServiceRequest`), its Zulex call on the `RegistrationGateway` port with a fake and a contract case, a funnel under `app/(funnel)/` and an entry in `FUNNELS` (`app/_components/funnels.ts`); the price is already in `SERVICE_PRICES`. Add the service to `SERVICES_ON_SALE` last, and update `service-selection.test.tsx`, which asserts which services are purchasable, and `app/(funnel)/register/page.test.ts`, which asserts `/register` is not found while Neuzulassung is off the list. The plan for Neuzulassung is `docs/registration-plan.md`.
44. **Can the customer cancel before an error, or only after one?** The price calculation says a processing fee of 19.99 € is retained "bei Abbruch durch den Kunden" and the rest refunded within 3–5 Werktagen, and the notice must be visible before payment. The application filed at Zulex cannot be withdrawn (the API has no cancellation endpoint, `docs/deregistration-user-journeys.md` § API & business problems, item 8), so today a customer can only cancel at 5b, after a correctable failure. Does "Abbruch" mean exactly that, or also giving up while the KBA is still processing?
   **Blocks:** M7 (the AGB fee clause, with Q13).
   **Provisional answer in code (not approved by the founder):** "Abbruch" is the cancel at 5b, as in the business logic document §3. The fee, the refund and the 3–5 Werktage are shown before payment (`app/(funnel)/_components/checkout-panel.tsx`, shared by both funnels), on the status page and in the refund email.
   **If the founder answers differently:** a cancel while the KBA is processing has to withdraw the application first, which needs Zulex to offer a way to do it; without one, the only option is a goodwill refund after the fact, decided by hand. Cancelling between payment and filing (status 1, normally seconds) would need `cancel-application.ts` to accept it and release the hold; today the status machine allows `cancelledByCustomer` only from a 5b.

**Added 2026-10-03 (Neuzulassung plan, `docs/registration-plan.md`)**

Each answer below is what milestones N1–N7 of the plan (merged 2026-10-03 to 2026-10-05) built while the question was still open, chosen as the safest option. None is approved by the founder. Neuzulassung is not on sale (Q43), so none of it reaches a customer yet.

45. **Does Neuzulassung need identity verification before launch?** Unlike de-registration (Q4), the request sends the owner's name, birth date and address to the KBA, and without a check anyone holding a Teil II and its code could register a car in someone else's name.
   **Blocks:** N5, N9; with Q1–Q3.
   **Provisional answer in code (not approved by the founder):** yes. Statuses 2 and 3 run for every service except de-registration (`DIRECT_SERVICES` in `application-status.ts`): `confirmPayment` starts the verification for a Neuzulassung instead of filing it, and Zulex is called only after status 3 (`checkIdentityVerification`, run by the poller and by the signed callback at `/api/webhooks/identity`). Only the fake identity adapter exists, and production refuses it while a service that verifies is in `SERVICES_ON_SALE` (`fakeIdentityProblem` in `src/config/env.ts`), so Neuzulassung cannot go on sale before a real adapter does.
   **If the founder answers differently:** `DIRECT_SERVICES` lists the services that go from payment straight to the KBA: adding `newRegistration` sends it 1 → 4 like de-registration, `confirmPayment` then calls `submitToKba` for it, and the code under `src/core/use-cases/identity/` goes unused. Update the tests that walk the verified path (`identity-verification.test.ts`, `application-status.test.ts`) and the guardrail in `env.test.ts`.
46. **On whose authority does Zulex file a private person's registration?** The API has a dealer path (`PERMANENT_POA`) and an individual path carrying data, but no proof that the owner asked for it. Does the customer give ZulexGO or Zulex a power of attorney (Vollmacht), in what form (checkbox, signed document, through Verimi), and must it be kept?
   **Blocks:** N6 (checkout consent), N8 (lawyer text), Q56.
   **Provisional answer in code (not approved by the founder):** three mandatory checkboxes at checkout for a Neuzulassung: the AGB with the withdrawal notice, the early-start waiver (Q13) and a power of attorney that also carries the direct-debit mandate for the vehicle tax. The order keeps the text versions and the time (`Application.consent`, `LEGAL_TEXT_VERSIONS` in `consent.ts`, migration `0012`), and `submitCheckout` refuses an order without all three (`ConsentRequired`). Both texts are drafts (`draft-1`) written by us, not by the lawyer.
   **If the founder answers differently:** the consents each service needs are `REQUIRED` in `consent.ts`, the wording of every checkbox is in the two `review-step.tsx` files, and `LEGAL_TEXT_VERSIONS` must change whenever a text does. A signed document or a Verimi signature becomes a step after payment, before status 3, with its own email.
47. **What if the verified identity does not match the owner on the order?** Verimi may report a name or birth date that differs from what the customer typed (a typo, a missing second first name).
   **Blocks:** N5.
   **Provisional answer in code (not approved by the founder):** nothing has been filed when the verification finds someone other than the owner, so the order goes to 5b (failure `identityMismatch`) with an email 5b that says nothing was filed. The customer corrects name and birth date (and, if they like, the eVB number and Teil II) on the status page at no cost, and the same verification is read again at once: a match files the order, another mismatch returns it to 5b. Names are compared in whole, ignoring case, accents, umlaut spellings, apostrophes and hyphens (`isTheOwner` in `verified-person.ts`); the birth date must agree exactly. Once an order's identity was verified its name and birth date can no longer be corrected, because the person was checked against them. A failed verification (not a mismatch) is 5c, refund minus 19.99 €. A mismatched customer who cancels instead pays the 19.99 € fee, as at any 5b (Q44).
   **If the founder answers differently:** taking name and birth date from the provider instead of the form removes the mismatch but moves the verification before payment, which reorders statuses 1–3. Treating a mismatch as a failed verification makes it 5c: end it with `identityVerificationFailed` in `accept` (`check-identity-verification.ts`). The correction is `recheck` in `correct-application.ts` with `new-registration-correction.ts`, and the two email 5b variants are in `copy.ts`.
48. **Verification deadline for Neuzulassung (Q14 for this service):** the card hold runs while the customer has not verified. How long, which reminder, and what happens when the deadline passes?
   **Blocks:** N2, N5.
   **Provisional answer in code (not approved by the founder):** a reminder after 2 days, counted from reaching status 2, and a deadline after 4, counted from the payment, so a retried email 2 repeats the deadline the customer was already given (`VERIFICATION_REMINDER_AFTER_MS` and `VERIFICATION_DEADLINE_AFTER_MS` in `verification-policy.ts`). The deadline ends before the card hold would be captured ahead (Q20). When it passes with no result the order is cancelled (the status page says the verification ran out), the hold is released in full (a captured payment is refunded in full, outcome `verificationExpired`) and email 6 follows. The provider's answer is read before the clock, so a customer who verified in time is accepted even if the poller reads it late. The reminder is its own email (`identityVerificationReminder`).
   **If the founder answers differently:** the deadline and reminder are one pure function in `verification-policy.ts`, beside `hold-policy.ts`; a deadline that ends after the capture margin means a captured payment is refunded instead of released, and keeping the fee makes it a `retainFee` row in `refund-policy.ts`.
49. **Who and what can be registered at launch?** The API takes cars, motorcycles, 125s, quads, trailers and trucks; taxi and rental use; day registrations; legal entities; E, H and seasonal plates.
   **Blocks:** N2, N6.
   **Provisional answer in code (not approved by the founder):** cars only (`vehicleType` `CAR` in the Zulex body, `request-bodies.ts`); a private keeper of 18 or over (`ownerSchema` checks the age against the clock; the funnel's first step asks that the keeper lives in Germany); a brand-new car with a 17-character VIN and a manufacturer-issued Teil II with a security code; standard registration, normal use. An E-plate only for a fully electric car, a seasonal plate with months 1 to 12, no H-plate (`new-registration-request.ts`, `plate-options.ts`); whether a season has a minimum or maximum length is not checked. The funnel's first step asks the questions and stops with the reason and the offline alternative (`requirements-step.tsx`).
   **If the founder answers differently:** widen `new-registration-request.ts` and the eligibility step; each new vehicle type needs its own plate-count and copy.
50. **Does Neuzulassung launch with plates?** Business-logic §1 says that for registrations "the licence plates are produced and sent by post" at 5a, but who makes them, how they are paid for after completion, and the delivery address are open (Q41). Without plates from us the customer has them made locally.
   **Blocks:** N7 (5a copy), N10.
   **Provisional answer in code (not approved by the founder):** launch without selling plates. Status page and email 5a say that the assigned plate is printed in the temporary certificate, that the authority posts the rest, and that plates are made at a local plate maker (`NEW_REGISTRATION_NEXT_STEPS` in `new-registration-next-steps.ts`, shared by both).
   **If the founder answers differently:** N10 moves before N9, with Q41's answers; the wording to change is in `new-registration-next-steps.ts`.
51. **Wish plates (Wunschkennzeichen):** the API takes a wish plate only with a PIN from a reservation made on the authority's own portal, and has no reservation endpoint. Do we offer it, and is any authority fee for it inside the 129 €?
   **Blocks:** N2, N6, Q52.
   **Provisional answer in code (not approved by the founder):** not offered: the request has no wish plate or PIN, the authority assigns the plate, and `NewRegistrationPatch` carries none. This also avoids "plate not available" failures and an unpriced fee.
   **If the founder answers differently:** a plate-and-PIN field group in the funnel's plate step (`plate-step.tsx`), `wishLicencePlate` in `new-registration-request.ts`, in `request-bodies.ts` and in `NewRegistrationPatch` (`registration-gateway.ts`) for the 5b correction, and a price rule if the fee is extra.
52. **Is 129 € the final price everywhere?** Authority fees can differ by authority and by plate type (E, seasonal, wish). Does 129 € cover every case, and are they gross of VAT (Q19)?
   **Blocks:** N8 (PAngV display).
   **Provisional answer in code (not approved by the founder):** 129 € flat (`SERVICE_PRICES.newRegistration`), no surcharge for any plate option, shown as Q19's provisional wording says. The `FEE` documents Zulex lists are kept and offered on the status page; no monthly reconciliation against them exists yet.
   **If the founder answers differently:** a surcharge per option goes into `pricing.ts` as a priced basket line (`quote()`), and the review step shows it.
53. **Which Neuzulassung failures are correctable (Q10 for this service)?** Business-logic §2 names wrong eVB and plate unavailable (5b), wrong owner data, wrong address, failed identity verification (5c). Zulex's `PATCH` can change only the eVB, the Teil II number and code, and a wish plate.
   **Blocks:** N2, N7.
   **Provisional answer in code (not approved by the founder):** an error in a field Zulex's `PATCH` can change (the eVB number, the Teil II number and code) is corrected at 5b on the status page; owner, address, bank and vehicle data cannot be corrected once filed. `REJECTION_CATALOGUE` is still empty (Q10), so every KBA code is unknown: one silent retry, then 5b, whose form offers only the eVB and Teil II, so a mistake in other data ends with the customer cancelling (the fee is kept). A failed identity verification is 5c.
   **If the founder answers differently:** entries in `REJECTION_CATALOGUE`, keyed by service if Zulex's codes differ per service.
54. **Holding the vehicle-tax bank account:** business-logic §4 says payment data is not stored on our servers. The direct-debit mandate for vehicle tax is not our payment, but it must be held from checkout until filing, after verification, possibly days later. May we store it encrypted, for how long, and may the account belong to someone other than the owner?
   **Blocks:** N3, N8.
   **Provisional answer in code (not approved by the founder):** the account is stored AES-GCM encrypted with the owner data, in one blob bound to the order's reference (`encrypted_details`, `new-registration-details.ts`, migration `0010`); German IBANs only (`bank-account.ts`); the account holder is taken to be the owner. It is erased when the order ends (completed, failed for good or cancelled): `applyEvent` drops it from the order's request (`withoutBankAccount`), so every way an order ends stores it without. An order that is only abandoned at checkout keeps it, as it keeps everything (Q22).
   **If the founder answers differently:** an earlier erase point (at filing, not at the end) means a refile after a 400 (Q37) has to ask for the IBAN again, and moves the call to `withoutBankAccount` in `applyEvent` (`application.ts`) from the terminal statuses to the `submittedToKba` event; no erasure at all removes that call. Another account holder needs a field Zulex does not have (Q56), and nothing checks today that the account is the owner's (`docs/threat-model.md`).
55. **What does the customer receive after 5a, and what must they do?** Documents shipped or picked up (`deliveryInfo`), whether the original Teil II must be sent to the authority, and what the temporary registration certificate allows until the post arrives.
   **Blocks:** N7 (5a copy and email), N8.
   **Provisional answer in code (not approved by the founder):** shipping to the owner's address only (`deliveryInfo` `SHIPPING`, `request-bodies.ts`). 5a lists the documents under their own names (confirmation, temporary certificate, fee statement), says the authority posts the rest and that its letter says what to do next, and claims nothing about driving on the temporary certificate (`NEW_REGISTRATION_NEXT_STEPS`).
   **If the founder answers differently:** pick-up adds a choice to the funnel's delivery and the copy of email 5a (`copy.ts`, `new-registration-next-steps.ts`).
56. **Zulex provider questions for Neuzulassung:** is it enabled for private persons on our account and in the integration environment? Where does the assigned plate appear when no wish plate is sent? Is `sepaInfo` required? The format of the Teil II number and security code? Which optional owner fields the authority expects? How is the owner's identity and power of attorney proven to the authority (Q1, Q46)? What does `PICKUP` mean for a private person? The Neuzulassung error codes, and do they differ from de-registration's? Can a `PATCH` drop a wish plate?
   **Blocks:** N4, N7, N9.
   **Provisional answer in code (not approved by the founder):** `sepaInfo` always sent; the assigned plate is not read from the API (the response does not carry it), so 5a says it is printed in the temporary certificate, an assumption until the spike shows where it appears; Teil II number 1–20 characters and code at least 1, as the spec says; one `REJECTION_CATALOGUE` for both services. The spike has not been run: it needs a `ZULEX_API_KEY` for the integration environment, and its findings are to go to `docs/registration-user-journeys.md`, which does not exist yet.
   **If the founder answers differently:** each answer lands in the Zulex adapter's schemas and `new-registration-request.ts`; findings go into `docs/registration-user-journeys.md` (N4).

## Verification

Verified milestone by milestone via the exit criteria above — each a test, CI job, or observed staging/production run, never a claim. Two cross-cutting checks at every milestone from M1: `npm run lint && npm run typecheck && npm test -- --ci && next build` green in CI, and `tests/integration/client-bundle-secrets.test.ts` plus the codes/tokens-absent-from-logs assertion still passing. Final verification is M9's beta: real KBA confirmations observed in production before the public gate opens.
