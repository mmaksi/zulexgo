# ZulexGO — MVP Production Launch Plan

## Context

ZulexGO is the B2C web app for online vehicle de-registration (Außerbetriebsetzung) on top of the B2B Zulex API. The repo today contains the full marketing layer (landing, legal placeholder pages, design tokens, Shadcn, Jest + msw) with colocated tests — and nothing else: no domain core, no ports/adapters, no config layer, no database, no funnel, no status page, no CI, no staging, no `.env` handling, and no git remote. The project's own rules (`CLAUDE.md` + `.claude/skills/`) are strict about *how* each of those must arrive: test-first for domain rules, interactive behaviour, security invariants, integration boundaries and bug fixes (and no tests for static presentation, tokens, or configuration), ports-and-adapters with contract tests and an in-memory fake per port, `APP_ENV`-driven stages, raw-SQL migration folders, and "nothing reaches production that has not run on staging."

This plan sequences the work from the current state to a public launch as dependency-ordered milestones. Per your answers: **no sizing or dates — ordering and exit criteria only**; **hosting is Vercel + Supabase**; **no identity-verification vendor**.

**Submission timing (confirmed):** the application is submitted to the Zulex API — and by it to the KBA — **immediately at checkout**, in the same server action that authorises the payment. The emailed one-time link is informational: it opens the status dashboard and gates nothing. The `CreateDeregistrationApplicationRequest` carries no owner identity and no email address (unlike the reactivation and address-change requests, which take `ownerInfo` with `email`), so neither ZulexGO nor Zulex has a separate identity step to run or observe for de-registration: under i-Kfz the scratched security codes *are* the proof of possession.

**Open item for the founder:** the original 7-step status list has "waiting for identity verification" and "identity verification completed" as steps 2–3. With immediate submission and no identity data in the request, those two steps have no event behind them. **Default in this plan: a 5-step journey** (paid & submitted → at KBA → completed | rejected-correctable | rejected-final). If the founder wants steps 2–3 kept, they can only be shown as static explanatory text, not as tracked states — that is a copy change in M5, nothing structural.



---

## Critical path

```
M0 Repo hygiene & remote
 → M1 Config layer, composition root, boundary lint, CI, staging pipeline
 → M2 Domain core + all ports with fakes (status machine)
 → M3 Supabase Postgres, migration runner, schema, seed
 → M4 WALKING SKELETON — real Zulex (integration env) + Stripe (test) + Mailer on staging,
      minimal funnel + status link + minimal status page
 → M5 Full status dashboard, all notifications, documents, resend-link
 → M6 Failure paths, correction flow, refunds, capture/hold policy
 → M7 Legal content, security & privacy hardening
 → M8 Operational readiness & production provisioning
 → M9 Beta (invite-gated, real vehicles) → public launch
```

Off the critical path, started in M0 and landing in M7/M8: legal texts (lawyer), Stripe live activation (KYC), Zulex production API key, **a status-change webhook from the Zulex API team** (see the poller decision below), domain + mail-domain authentication, Euro Plate web licence, brand sign-off on the semantic colours, the Zulex error-code catalogue the founder is chasing.

The funnel UI (M4 Track B) starts as soon as M2's fakes exist and runs alongside M3.

---

## Default technical decisions (overridable; none blocks a milestone)

| Decision | Default | Why |
|---|---|---|
| Hosting | **Vercel**, two projects tracking two permanent branches: `zulexgo-staging` deploys `staging` (`APP_ENV=staging`), `zulexgo` deploys `main` (`APP_ENV=production`) | Separate projects give hard secret separation between stages, which the `environments` skill requires ("secrets must not work across stages"). The repository is public so branch protection is free: no direct push to either branch, CI required on both, and `main` accepts a pull request from `staging` only — so "nothing reaches production that has not run on staging" is enforced by the forge rather than by habit. See `CONTRIBUTING.md`. Vercel Cron drives the poller; needs a plan tier that allows per-minute crons, and commercial use requires Vercel Pro regardless. |
| Database | **Supabase Postgres**, region Frankfurt (eu-central-1), one project per stage | EU residency for GDPR. Accessed **server-side only** through the Supavisor pooler (transaction mode) from Vercel functions; migrations use the direct connection. No Supabase Auth (no accounts by design), no client-side Supabase SDK, no RLS-based access — the app is the only client. |
| Postgres driver | `pg` (node-postgres) behind the `ApplicationRepository` adapter | No ORM, so the raw-SQL migrations stay the single source of truth. |
| Migration runner | **Small in-repo runner** (TDD'd) reading `db/migrations/NNNN_slug/{up,down}.sql`, recording version + checksum in `schema_migrations`, one transaction per migration | Supabase CLI migrations are flat, timestamped, up-only — incompatible with the skill's folder-with-`down.sql` rule. Owning ~100 lines is cheaper than amending the skill. Override: adopt Supabase CLI and amend `database-migrations`. |
| Document cache | **Supabase Storage**, private bucket, server-side access only, signed URLs never exposed — the app streams the PDF after token validation | Keeps official confirmations out of Postgres rows and behind the same token check as the dashboard. |
| Status updates from Zulex | **Per-application polling with backoff, driven by a Vercel Cron heartbeat.** The cron hits `app/api/internal/poll/route.ts` every minute with a bearer `CRON_SECRET`, but only rows whose `next_poll_at` is due are fetched — the API is *not* swept every minute. Default schedule: authority `online` → 1, 2, 5, 10, 30 min, then hourly; `unavailable`/`offline` (manual processing) → every 6 h, then daily; any `Retry-After` overrides; terminal states stop polling. Roughly 10–30 GETs per application over its life. | The Zulex API exposes no webhook for application status — the spec only mentions, in prose, that a `noticeId` arrives "via webhook", with no registration or payload contract. Polling is the only way to learn about a transition when nobody is looking at the status page, and the plan requires an email on every change. **Better alternative, pursued in parallel:** ask the Zulex API team for a signed status-change webhook (`applicationId`, new `status`, `documents`). If it lands, `app/api/webhooks/zulex/route.ts` (signature-verified) triggers `advance-status` immediately and the poller drops to a slow reconciler (hourly) that catches missed deliveries — it is never removed, because a webhook that is lost is otherwise a customer who is never emailed. A queue service (Inngest/QStash) would replace the cron with per-application delayed jobs; it is a fair choice but adds a vendor for no gain at MVP volume. |
| Transactional mail | **Resend** (EU data-processing terms confirmed at sign-up) | Simplest API and domain auth; the `Mailer` port + contract suite make Postmark/Brevo a one-folder swap if EU posture requires it. |
| Encryption of codes at rest | Application-level AES-GCM in the Postgres adapter, key from env (rotatable), from migration `0001` onward | Key stays off the DB host; the in-memory fake stays plaintext; no later data migration. |
| Icon library | **lucide** (installed, Shadcn default), `ChevronRight` as the bullet. **Settled in M0:** `docs/design-standard.md` §5.5 amended from Font Awesome to lucide, with the deviation from the print style guide recorded in the section itself. | One icon library, not two. Shadcn writes lucide imports into every component it generates, so any second set has to be maintained by hand alongside it. Font Awesome was trialled in M0 and reverted for exactly that reason — it is also not one of Shadcn's supported `iconLibrary` values (`lucide`, `tabler`, `hugeicons`, `phosphor`, `remixicon`), so the CLI could not have been pointed at it anyway. Icons are decorative and carry no brand mark, so no brand sign-off is outstanding. |
| Refund policy | Full refund on rejected-final (release if uncaptured, refund if captured) | Simplest to state in the AGB, least chargeback risk; business decision, overridable. |
| Price display (PAngV) | One all-inclusive price per plate count including the authority fee, from `src/config/pricing.ts`; reconciled monthly against `FEE` documents | The API only reports fees after the fact; the customer needs the total before paying. |

---

## Milestones

### M0 — Repo hygiene and remote

**Goal:** Make the repository safe for secrets and collaborators before either exists.

**Why first:** `.gitignore` has no `.env*` entry, so the first `.env.local` would be committable; `.claude/` and `docs/` are gitignored, so CI and collaborators cannot see the rules this plan enforces; there is no remote, so the PR workflow in `.claude/commands/commit-push-pr.md` cannot run.

**How (high level):**
- `.gitignore`: add `.env*` with `!.env.example`; stop ignoring `/docs` and `/.claude` (keep `.claude/settings.local.json` ignored).
- Create the GitHub remote; protect `main` (PRs only, CI required once M1 exists). Push.
- `package.json`: rename `my-app` → `zulexgo`; add `typecheck` (`tsc --noEmit`).
- Resolve the Shadcn layout conflict: `components/ui` + `lib/` sit at the root while `project-structure` prescribes `src/ui` + `src/lib`. Default: move them and repoint `components.json` aliases (tests move with them). Override: amend the skill.
- Kick off every external lead-time item (no code): lawyer for AGB/Impressum/Datenschutz, Stripe business verification, Zulex production key + integration credentials, **status-change webhook request to the Zulex API team**, domain purchase, Euro Plate licence enquiry, brand sign-off requests, error-code catalogue follow-up.

**Exit criteria:** fresh clone → `npm ci && npm run lint && npm run typecheck && npm test` green; `git check-ignore .env.local` succeeds and `git check-ignore docs/prd.md` fails; remote exists.

**Tests:** none — configuration only, which `CLAUDE.md` places outside the test-first rule.

---

### M1 — Config layer, composition root, boundary lint, CI, staging pipeline

**Goal:** Every later milestone can add an env var, an adapter, and a guardrail the prescribed way, and every push is verified and deployable to a real staging URL.

**Why here:** `environments` needs zod-validated `APP_ENV` read once in `src/config/`; `external-services` needs `src/config/container.ts` and the `no-restricted-imports` rule *before* the first vendor adapter; the TDD rule only means something once CI enforces it. Deploying the existing marketing site to staging now proves the deploy path at zero risk.

**How:**
- Add `zod` as a direct dependency. `src/config/env.ts` validates `APP_ENV`, `DATABASE_URL`, `DIRECT_DATABASE_URL`, `ZULEX_BASE_URL`, `ZULEX_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `MAIL_DRIVER`, `PAYMENT_DRIVER`, `REGISTRATION_DRIVER`, `REPOSITORY_DRIVER`, `STORAGE_DRIVER`, `MAIL_ALLOWLIST`, `APP_BASE_URL`, `CODES_ENCRYPTION_KEY`, `CRON_SECRET`, `SUPABASE_STORAGE_*`. Fails fast naming the missing variable.
- **Five driver variables, not three** (see Deviation 6). Each one names the adapter a port is wired to, and each gates the credentials that adapter needs:

  | Driver | Values | Gates | Flips to the real value in |
  |---|---|---|---|
  | `PAYMENT_DRIVER` | `fake` \| `stripe` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | M4 |
  | `REGISTRATION_DRIVER` | `fake` \| `zulex` | `ZULEX_BASE_URL`, `ZULEX_API_KEY` | M4 |
  | `MAIL_DRIVER` | `console` \| `resend` | `RESEND_API_KEY`; `MAIL_ALLOWLIST` on staging | M4 |
  | `REPOSITORY_DRIVER` | `fake` \| `postgres` | `DATABASE_URL`, `DIRECT_DATABASE_URL`, `CODES_ENCRYPTION_KEY` | M3 |
  | `STORAGE_DRIVER` | `fake` \| `supabase` | `SUPABASE_STORAGE_URL`, `SUPABASE_STORAGE_BUCKET`, `SUPABASE_STORAGE_SERVICE_KEY` | M5 |

  A variable is required **only when its driver is switched on**, so `APP_ENV=dev` boots on fakes with no secrets at all and staging deploys in M1 before any vendor credential exists. Production rejects every fake value, so a deployed production cannot quietly run on one.
- Guardrails as tests: live Stripe key rejected unless production; test key rejected in production; production Zulex URL rejected unless production; production rejected on any fake driver; staging mail confined to `MAIL_ALLOWLIST`, which production forbids; no source file branches on `NODE_ENV`.
- `src/config/container.ts` — `createContainer(env)`. First two ports done the full 7-step way (port → contract → fake → real → wire → lint): `Clock` and `TokenGenerator`, so the pattern exists before Stripe/Zulex.
- ESLint `no-restricted-imports` block from `external-services` added to `eslint.config.mjs`.
- `.env.example` committed with every variable and a one-line comment.
- `.github/workflows/ci.yml`: `npm ci`, lint, typecheck, `jest --ci`, `next build` with placeholder staging env and a canary `ZULEX_API_KEY` that must not appear in `.next/static`. A second job, `main accepts staging only`, fails any pull request into `main` whose source branch is not `staging`. The first is required on both branches, the second on `main` only.
- Vercel: two projects created; `zulexgo-staging` auto-deploys `staging`, `zulexgo` auto-deploys `main` — branch protection is the gate, so production has none of its own. Supabase: staging project provisioned (schema arrives in M3).
- `next.config.ts`: baseline security headers (HSTS, `X-Content-Type-Options`, `Referrer-Policy`). CSP deferred to M7 once Stripe Elements' needs are known.

**Exit criteria:** CI required on `main` and `staging` and red on a deliberately failing test; staging URL serves the marketing page; a test proves `createContainer` with an `sk_live_` key and `APP_ENV=staging` throws; `tests/integration/client-bundle-secrets.test.ts` still passes.

---

### M2 — Domain core and all ports with in-memory fakes

**Goal:** The whole flow — checkout with immediate submission, polling, status — runs end to end in memory with no vendor, network, or database.

**Why here:** Fakes let the funnel UI and use cases be built test-first while real adapters are written in parallel. The status machine is pure logic and must exist before the schema (M3) encodes it and the dashboard (M5) renders it.

**How:**
- `src/core/domain/`: `LicencePlate`, `SecurityCode` (3-char seal / 7-char certificate; `toString()` redacts), `Vin`, `Money`, `ApplicationReference` (`ZG-XXXXXX`), and **`ApplicationStatus`** — the customer status machine: `paid` → `submitted_to_kba` → `completed` | `rejected_correctable` | `rejected_final`, plus `technical_error` (Zulex `ERROR`, retryable) and `submission_failed` (400/unavailable at checkout, hold released). `paid` and `submitted_to_kba` are normally set in the same checkout transaction; `paid` persists on its own only when the Zulex call fails. Pure `advance(status, event)` with every transition tested; an unknown Zulex status tag keeps `submitted_to_kba`.
- `src/core/errors/`: domain errors (`ValidationError`, `GatewayRejected`, `GatewayUnavailable`, `PaymentDeclined`, `HoldExpired`, `TokenInvalid`…).
- `src/core/ports/` with a documented guarantee list and a `*.contract.ts` suite each: `ApplicationRepository`, `RegistrationGateway`, `PaymentProvider`, `Mailer`, `DocumentStore` (+ `Clock`, `TokenGenerator` from M1).
- `src/adapters/*/fake/` — one in-memory fake per port passing its contract. The fake gateway is scriptable (next status, next error, 429 + `Retry-After`) so J3–J6 can be driven; the fake payment provider models hold expiry via the injected `Clock`; the fake mailer records sends.
- `tests/fixtures/` + `tests/msw/` skeletons with obviously fake values (`AAA111`, `example.test`), validated by the same zod schemas the adapters will use.
- Dev container: `APP_ENV=dev` → all fakes.

**Port order:** `ApplicationRepository` first (use cases need it), then `RegistrationGateway` and `PaymentProvider` (skeleton), then `Mailer` (the status link is delivered only by email, so it is on the skeleton's path), then `DocumentStore`.

**Exit criteria:** every port has a contract suite and a passing fake; one test per status transition; a test that `SecurityCode` never appears in `JSON.stringify` or `String()` output.

---

### M3 — Supabase Postgres, migration runner, schema, seed

**Goal:** Applications, payments, status history, and tokens persist across requests in every stage; a developer sees every UI state right after `npm run db:seed`.

**Why here:** On Vercel nothing survives between the checkout request, the status-page visit, and the poller tick — the skeleton is impossible without a real repository. The schema encodes M2's machine.

**How:**
- In-repo migration runner with `db:migrate`, `db:migrate:down`, `db:status`; CI runs up → down → up against a Postgres service container (the skill's rehearsal).
- `db/migrations/0001_create_applications` (encrypted codes, `idempotency_key` unique, `zulex_application_id`, `next_poll_at`, `poll_attempts`, `authority_ikfz_status`, `agb_version`, `consent_at` — adding consent columns now avoids an expand/contract cycle in M7), `0002_create_payments`, `0003_create_status_history`, `0004_create_status_tokens`. Each folder has `up.sql`, `down.sql`, `README.md`.
- `src/adapters/repository/postgres/` passing the `ApplicationRepository` contract against a real local Postgres.
- `db/seed/seed.ts`: idempotent, deterministic, refuses unless `APP_ENV=dev` (guardrail test); at least one application per `ApplicationStatus` value — the coverage test iterates the enum, so when the dashboard lands in M5 it cannot render a state the seed lacks.
- Staging Supabase migrated in the deploy step; never seeded (guardrail test). Staging and production flip `REPOSITORY_DRIVER=postgres`, which makes `DATABASE_URL`, `DIRECT_DATABASE_URL` and `CODES_ENCRYPTION_KEY` required at boot.

**Exit criteria:** CI migration rehearsal green; Postgres adapter passes the same contract file as the fake; enum-coverage seed test green; `APP_ENV=staging npm run db:seed` exits non-zero.

---

### M4 — Walking skeleton on staging

**Goal:** One real test-mode de-registration runs on staging: Stripe test card authorised → application created at `https://integration-zulex.de/zulex-api/v1` in the same request → hold captured (authority online) → confirmation email with the status link delivered to an allowlisted address → poller advances status → status page shows the current step.

**Why here (the skeleton boundary):** this is the earliest point where all irreducible unknowns are exercised together — real Zulex integration-environment behaviour (error bodies, whether it reaches `FINISHED`, 429 behaviour), Stripe manual capture, email deliverability, and polling on serverless. Everything before M4 is the minimum to run it; everything after is hardening or scope.

**Track A — adapters and use cases:**
- Time-boxed **read-only spike** against the integration environment (throwaway, untested — it never becomes production code): capture real shapes for create/get/patch, `/registration-authorities`, `/documents/{id}`, an induced 400 and a 429. Scrub → `tests/fixtures/zulex/`; findings → `docs/deregistration-user-journeys.md`; delete spike code.
- `src/adapters/registration/zulex/`: zod response schemas, `X-Idempotency-Key` always sent, `X-Api-Key` from env, `Retry-After` honoured, unknown tags → in progress, vendor errors → domain errors. Passes the contract via msw handlers built from captured fixtures.
- `src/adapters/payment/stripe/`: PaymentIntent `capture_method=manual`; authorize / capture / release / refund idempotent on our ids; hold expiry → domain error. Contract via stripe-mock/msw. Signature-verified webhook route for cancellations/expiry.
- `src/adapters/mail/resend/`: passes the `Mailer` contract via msw; **dev hard-blocks sending; staging enforces `MAIL_ALLOWLIST`** (tests for both). Two templates for now: order confirmation with status link, status changed.
- Add each SDK to `no-restricted-imports` in the same change as its adapter.
- Use cases: `check-eligibility` (prefix → `ikfzStatus` → processing-time expectation), `submit-checkout` (authorize → persist encrypted → create Zulex application with `X-Idempotency-Key` → `submitted_to_kba` → capture if authority online, else keep the hold → issue token → send confirmation email; on a Zulex 400/unavailable: release the hold, `submission_failed`, return the form for editing), `advance-status` (one GET per *due* row, then reschedule with the backoff table from the decisions section; never logs codes or tokens), `get-status-by-token`.
- `app/api/internal/poll/route.ts` behind `CRON_SECRET`; `vercel.json` cron every minute. The backoff schedule is a pure function (`nextPollAt(status, ikfzStatus, attempts, retryAfter, now)`) tested against every branch, so "how hard do we hit the API" is a table, not behaviour scattered through the poller.
- If the Zulex webhook has arrived by now: `app/api/webhooks/zulex/route.ts`, signature-verified, replay-protected, calls `advance-status` for the one application; the cron schedule drops to the reconciler cadence. Same use case, second trigger.
- Integration tests: `deregistration-checkout.test.ts` (incl. the 400-at-checkout branch proving the hold is released and no row is left in `submitted_to_kba`), `status-polling.test.ts`, plus the required assertion that codes and tokens are absent from captured logs and rendered status HTML.

**Track B — minimal funnel and status page (starts after M2, parallel to M3):**
- `app/(funnel)/deregister/`: progress indicator; eligibility (plate count, documents check, prefix → availability notice); application form (plate, VIN, codes with contextual front code, email, locator-image placeholders); review & pay (masked summary, total price, two consent checkboxes, Stripe Payment Element, sticky mobile CTA); confirmation ("submitted — your status link is on its way to {email}", reference number).
- `app/status/[token]/`: vehicle summary + read-only stepper from the domain enum; invalid token → neutral error page, no existence disclosure.
- Client validation shares zod schemas from `src/core/domain`. Plate rendered with the existing `plate-text` fallback until Euro Plate is licensed.
- **What gets tests here (per `CLAUDE.md`):** form validation and the contextual front-code field, forward/back navigation with preserved state, the disabled-CTA rule until both consents are ticked, the invalid-token error page, and accessible names on every input. **What does not:** the progress indicator, confirmation copy, section frames, the stepper's visual states.

**Convergence:** staging container wired `REGISTRATION_DRIVER=zulex`, `PAYMENT_DRIVER=stripe`, `MAIL_DRIVER=resend`; run the scenario by hand with a Stripe test card and an allowlisted inbox.

**Exit criteria:** on staging, one run yields an `applications` row with a Zulex `applicationId`, a captured test PaymentIntent, a delivered confirmation email, ≥1 poller-driven status transition, and a status page on the right step; the two integration flows + secrets-absent test pass in CI; the boundary lint fails on a deliberate `import Stripe from 'stripe'` inside `src/core/`.

**Risks:** integration env may never reach `FINISHED` or return documents (then the completed path is proven via msw and confirmed in beta); the spike may force port renames — do it on day one; Stripe Elements CSP needs — noted for M7.

---

### M5 — Full status dashboard, notifications, documents, resend-link

**Goal:** A paying customer can follow every step by email and on the dashboard, and download the official confirmation when finished.

**How:**
- All email templates (order confirmation + one per status change + resend-link) as reviewed HTML snapshots — the one snapshot case `CLAUDE.md` permits — carrying only plate and reference, never codes or tokens beyond the link itself. Sent by `advance-status` on every transition.
- `src/adapters/storage/supabase/` — the Supabase Storage cache of the Zulex documents — passing the `DocumentStore` contract; `UNKNOWN` → "Dokument". Staging and production flip `STORAGE_DRIVER=supabase`, which makes the `SUPABASE_STORAGE_*` variables required at boot.
- Dashboard: stepper (5 steps by default — see the open item in Context) with timestamps from `status_history`, outcome block (success + downloads / rejection reason placeholder), help block, **"Resend my link"** (email + reference → send to the *stored* address only; constant-time response; rate-limited; token rotated on resend), revalidation on focus/interval, stepper pulse while polling.
- Token lifecycle: ≥128-bit, revocable, rate-limited lookups.

**Exit criteria:** `status-notifications.test.ts` drives a fake gateway through every transition and asserts exactly one email per transition with no code in any body; staging drops non-allowlisted recipients (test); a fixture document downloads through the token-guarded route.

---

### M6 — Failure paths, correction flow, refunds, hold policy

**Goal:** Every non-happy journey (J3–J9, J11 in `docs/deregistration-user-journeys.md`) ends in a defined state; a customer is never charged for a failed submission and never asked to resubmit a duplicate.

**How:**
- J3 (400 on create): the M4 skeleton already releases the hold and returns the form; here it gains field-level mapping of `errorInfo.details` where the spike showed them, and a "nothing was charged" notice.
- J6 (`ERROR`): automatic `/applications/{id}/retry` with capped backoff; quiet UX; support escalation after N failures.
- J4/J5: data-driven `src/core/domain/rejection-catalogue.ts` (code → correctable | final | unknown, with German copy). Correction form on the dashboard → `PATCH` changed fields only → back to polling. Rejected-final → refund or release; policy text on screen.
- Hold policy (J7): capture on Zulex `201` when `ikfzStatus=online`; otherwise hold and capture on `FINISHED`; if the hold nears expiry, email a re-authorisation request; webhook from M4 feeds cancellations.
- J8: duplicate warning for same plate + VIN with an open application.
- J11: special plates flagged "may be rejected" in eligibility until the provider clarifies.

**Exit criteria:** one integration test per journey; catalogue test proves an unknown code → correctable once, second rejection → final; refund idempotency test; hold-expiry test proves a manual-processing application whose hold lapses before `FINISHED` triggers the re-authorisation email and never a silent capture attempt.

**Fallback if the error catalogue is still missing at launch:** every rejection is shown as correctable once with a generic rewrite of `errorInfo.description`; a second rejection is final and triggers the refund policy; support is alerted on every final rejection for manual reclassification. Same plumbing either way — a catalogue update is a data PR with a test.

---

### M7 — Legal content, security and privacy hardening

**Goal:** The service may legally take money from a German consumer and would pass a security review.

**Why here:** consent capture needs M3's columns and M4's checkout; CSP needs the final third-party script set; retention needs M5's terminal states.

**How:**
- Lawyer-reviewed AGB/Impressum/Datenschutz replace the placeholders; AGB version + withdrawal-waiver + immediate-performance consents stored per application (tests: checkout impossible without both).
- PAngV price from `src/config/pricing.ts`; VAT and authority fee itemised.
- `next.config.ts` CSP (Stripe domains), `frame-ancestors`, permissions policy — asserted in route tests.
- Rate limiting on status lookup, resend, eligibility, checkout (per IP + per token), with tests.
- Log-redaction layer + the required test that codes/tokens never appear in logs; `audit_log` migration for status changes and refunds.
- Retention cron: purge security codes N days after a terminal state; anonymise after the statutory period; uses the `Clock` port.
- `/security-review` of the branch, `npm audit`, dependency pinning; short threat-model note (token brute force, IDOR on documents, webhook replay).
- Brand items: apply approved semantic colours; Euro Plate self-hosted WOFF2 if licensed, otherwise the existing fallback ships (checked in the browser, not tested — it is presentation).

**Exit criteria:** legal pages contain reviewed text and no placeholder; consent-gate test; header tests; retention test; a rendered status page snapshot contains no 3- or 7-character code from fixtures.

---

### M8 — Operational readiness and production provisioning

**Goal:** Production exists, is observable and recoverable, and the team can answer "what do we do when X" from a runbook.

**How:**
- Production Vercel project + production Supabase (Frankfurt) with `APP_ENV=production`, live Stripe keys, Zulex production key and `https://app.zulex.de/zulex-api/v1`. Deploy pipeline runs the guardrail tests against each stage's real config (production rejects a test key; staging rejects the production URL).
- Domain, TLS, SPF/DKIM/DMARC for the mail domain.
- Monitoring: error tracking; uptime on `/` and the status route; poller-lag alert (`next_poll_at` overdue) and a Zulex-call-volume alert (GETs per hour above the expected envelope means the backoff is broken); stuck-application alert (in `submitted_to_kba` beyond authority SLA); Stripe webhook failure alert; capture/refund anomaly alert; daily reconciliation (Stripe captures vs applications).
- `docs/runbooks/`: stuck application, manual refund, hold expiring, Zulex outage, key rotation (config change, no deploy), rollback incl. `down.sql` rehearsal on staging, restore from Supabase PITR.
- Backup drill: restore staging to a scratch project, verify migration status.
- Load/rate-limit rehearsal: poller under sustained 429 honours backoff; status endpoint under brute-force returns 429 without timing leaks.
- Go/no-go checklist from PRD §6 success criteria + guardrails.

**Exit criteria:** production deploys only from `main`, which accepts only `staging` after the full suite ran on it; alerts fire in a drill; restore drill documented; checklist signed.

---

### M9 — Beta, then public launch

**Goal:** Real de-registrations by a known group succeed end to end in production before the public CTA goes live.

**How:**
- `LAUNCH_MODE=beta|public` in config: beta requires an invite code and caps daily applications; the marketing CTA points to a waitlist.
- Founder + friends-and-family run real de-registrations: at least one online authority, one manual-processing authority, one single-plate vehicle.
- Watch M8 dashboards; fix bugs test-first; every hotfix goes through staging — no exceptions.
- Flip to `public`, remove the cap, announce.

**Exit criteria:** N beta applications with 100% status accuracy against backend state; zero code/token exposure findings; ≥1 official confirmation PDF downloaded from production; refund path exercised once deliberately; then the gate flips.

---

## Blocked items and the fallback shipped if unresolved at launch

| Item | Plumbing lands in | Fallback |
|---|---|---|
| Zulex error-code catalogue | M6 | unknown → correctable once → final + refund + support alert |
| Euro Plate web licence | M7 | existing `plate-text` Kanit fallback + legibility test |
| Semantic colour sign-off | M7 | ship the derived palette already in `app/globals.css` |
| Icon library decision | resolved in M0 | lucide; §5.5 amended, no sign-off outstanding |
| Fee table / price | M7 | flat all-inclusive price per plate count, monthly reconciliation |
| Refund policy | M6 | full refund on rejected-final |
| Stripe live / Zulex production key | M8 | beta runs founder-owned vehicles first; public gate stays closed |
| Special plates (E/H/seasonal) | M6 | eligibility warns "may be rejected" |
| Zulex status-change webhook | M4 (route) | per-application polling with backoff is the complete solution on its own; the webhook only shortens latency |

## Deviations from skill rules (explicit)

1. **In-repo migration runner** instead of Supabase CLI migrations — the skill's folder + `down.sql` layout is incompatible with the CLI's format.
2. **Shadcn files moved** from `components/`+`lib/` to `src/ui`+`src/lib` to satisfy `project-structure`; alternatively amend the skill.
3. **Design standard §5.5 amended** from Font Awesome to lucide — **done in M0**, not pending. The deviation and its reasoning are recorded inside §5.5 so the change is not later mistaken for drift.
4. **`.claude/` and `docs/` un-ignored** in M0 — `CLAUDE.md` calls them authoritative; CI and collaborators must see them.
5. **Five driver variables, not the three named in M1** — `REPOSITORY_DRIVER` and `STORAGE_DRIVER` were added so that "required only when switched on" has something to switch for `DATABASE_URL` and `SUPABASE_STORAGE_*`. Without them the only choices were to require a database URL on every deployed stage — which would have blocked the M1 staging deploy until M3 — or to leave it optional forever, which would let production boot with no database. **Decided in M1.**
6. **`Clock` and `TokenGenerator` are real in every stage**, including dev, while every vendor port follows the skill's "fake in dev" rule. They carry no driver variable: there is no network, no money and no secret to fake away, and a frozen clock or a predictable status link in a running dev server is a bug rather than a convenience. Their fakes exist for tests, which is what `external-services` rule 4 requires. **Decided in M1**; the reasoning is recorded in `src/config/container.ts`.
7. **Two permanent branches, `staging` and `main`, instead of promoting a build** — `staging` and `main` each have a Vercel project, and branch protection enforces the path between them: no direct push to either, CI required on both, and `main` accepts a pull request from `staging` only. The repository is public because protected branches are a paid feature on private ones. `enforce_admins` is on for both branches; no approving review is required (`docs/provisioning.md` §4). **Decided after M1.**
8. **`test-driven-development` skill vs `CLAUDE.md`:** the skill still says "Always" for every feature and lists configuration as an exception that needs approval; `CLAUDE.md` now scopes test-first to logic, behaviour, boundaries and fixes, and excludes presentation and configuration outright. `CLAUDE.md` wins as the project instruction; the skill's "When to Use" section should be aligned to it in M0 so the two never disagree.

## Critical files (to create or change)

- `.gitignore`, `package.json`, `components.json` — M0
- `src/config/env.ts`, `src/config/container.ts`, `eslint.config.mjs`, `.env.example`, `.github/workflows/ci.yml`, `CONTRIBUTING.md`, `next.config.ts` — M1
- `src/core/domain/application-status.ts` (the machine everything derives from), `src/core/ports/*.ts` + `*.contract.ts`, `src/adapters/*/fake/` — M2
- `db/migrations/0001_…0004_*`, `db/seed/seed.ts`, `src/adapters/repository/postgres/` — M3
- `src/adapters/{registration/zulex,payment/stripe,mail/resend}/`, `src/core/use-cases/*.ts`, `src/core/domain/poll-schedule.ts`, `app/(funnel)/deregister/`, `app/status/[token]/`, `app/api/internal/poll/route.ts`, `app/api/webhooks/zulex/route.ts` (if the webhook exists), `vercel.json`, `tests/integration/*.test.ts` — M4
- `docs/launch-plan.md` (this document), `docs/runbooks/` — M8

## Verification

The plan is verified milestone by milestone through the exit criteria above — each is a test, a CI job, or an observed staging/production run, never a claim. Two cross-cutting checks apply at every milestone from M1 onward: `npm run lint && npm run typecheck && npm test -- --ci && next build` green in CI, and `tests/integration/client-bundle-secrets.test.ts` plus the codes/tokens-absent-from-logs assertion still passing. The final verification is M9's beta: real KBA confirmations observed in production before the public gate opens.
