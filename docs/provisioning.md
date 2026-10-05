# Provisioning — what to create, once, by hand

The repo is stage-agnostic: `APP_ENV` plus the variables in `.env.example` are the whole configuration surface. This is the click-by-click other half and the only record of which accounts exist and who owns them. `docs/launch-plan.md` says *when* each item is needed; this says *how*.

Nothing here belongs in code; no value from here belongs in git.

---

## The shape

| | dev | staging | production |
|---|---|---|---|
| Where | your laptop | Vercel project `zulexgo-staging` | Vercel project `zulexgo` |
| Git branch | — | `staging` | `main` |
| `APP_ENV` | `dev` | `staging` | `production` |
| Deploys | — | automatically, on every merge to `staging` | automatically, on every merge to `main` — which only `staging` may merge into |
| Zulex | integration host (from M4) | integration host (from M4) | production host |
| Stripe | sandbox `dev` (from M4) | sandbox `staging` (from M4) | live account (business verification pending) |
| Mail | console | Resend, allowlisted recipients | Resend |
| Identity (Verimi, added later) | fake | fake (`IDENTITY_DRIVER=fake`, the only value until a Verimi adapter exists) | the fake is refused while a service that verifies the customer is on sale, and Neuzulassung is one, so it cannot go on sale before Verimi |
| Database | in-memory, seeded at boot | Supabase project (Frankfurt), seeded on deploy | separate Supabase project (Frankfurt), never seeded |
| Document storage | in-memory, seeded at boot | Supabase Storage in the staging project, bucket `kba-documents` (§9) | Storage in the production Supabase project |
| Money | none | none | real |

Two Vercel **projects**, not two branches of one: secrets are scoped per project, so production physically cannot read a staging key. The `environments` skill requires this separation; one project cannot give it.

---

## 1. Vercel — staging  *(needed for M1; created 2026-09-27)*

Do §3 first: step 5 needs the database values.

1. Sign up at vercel.com with **Continue with GitHub**. Hobby is enough to start staging, but it is for non-commercial use only; move to Pro before real customers (and before M4's per-minute poller cron).
2. **Add New → Project → Import Git Repository.** Install the Vercel GitHub app when asked, granting it `mmaksi/zulexgo` only. Import it and name the project **`zulexgo-staging`**. Framework preset Next.js, root directory `./`; leave the build command alone (`vercel.json` sets it). Add no environment variables here: at import they apply to every environment. Deploy. This first deployment builds `main` and errors at runtime; that is expected.
3. **Settings → Environments → Production → Branch Tracking** → **`staging`** → Save. Every merge to `staging` now deploys here.
4. **Settings → Environment Variables**: check that **Enable access to System Environment Variables** is on; `scripts/vercel-build` reads `VERCEL_ENV`.
5. Add these with environment **Production** only (not Preview or Development), marking every secret **Sensitive**:

   ```
   APP_ENV=staging
   APP_BASE_URL=https://zulexgo-staging.vercel.app   # the domain under Settings → Domains
   CRON_SECRET=<openssl rand -base64 32>             # Sensitive
   PAYMENT_DRIVER=fake
   REGISTRATION_DRIVER=fake
   MAIL_DRIVER=console
   STORAGE_DRIVER=fake
   REPOSITORY_DRIVER=postgres
   DATABASE_URL=<§3, transaction pooler>             # Sensitive
   DIRECT_DATABASE_URL=<§3, session pooler>          # Sensitive
   CODES_ENCRYPTION_KEY=<openssl rand -base64 32>    # Sensitive
   ```

   These are the first deploy's values: payment, registration, mail and storage start fake because those vendors come later. §8 has since switched payment and mail to Stripe and Resend, and §9 covers storage; registration switches once the Zulex API is back. The app refuses to boot if a driver is flipped without its key.

6. **Deployments → Create Deployment** → branch `staging`. The marketing site must serve at `APP_BASE_URL`. Once M3 is merged, the build log also shows the migrations running.
7. Region needs nothing: `vercel.json` pins Frankfurt (`fra1`).

## 2. Vercel — production  *(needed for M8, create it now if convenient)*

Same import, named **`zulexgo`**, except **Production Branch** = **`main`**.

Only a pull request from `staging` that passed CI reaches `main` — branch protection enforces it, so the deploy needs no gate of its own. Flow: `CONTRIBUTING.md`.

Leave its environment variables empty until M8; a half-configured production project that boots is worse than one that refuses to.

## 3. Supabase

One project per stage, region **Frankfurt (eu-central-1)** — EU residency is a GDPR requirement, not a preference.

- **Staging** — exists: **`zulexgo-staging`**, ref `nkojumzoqtqmkzxbpmil`, Postgres 17.
- **Production** — create in M8, the same way. Never share a connection string or key between stages.

No Supabase Auth (no accounts by design), no client-side Supabase SDK, no RLS-based access: the app is the database's only client, server-side only.

### Connecting a stage to its database  *(M3 for staging, M8 for production)*

1. **Turn off the Data API**: Integrations → Data API → Overview → **Enable Data API** off. Supabase otherwise serves `public` tables over REST to anyone holding the anon key, and grants every new `public` table to `anon`, `authenticated` and `service_role` by default. Every table also has row-level security on with no policy, so the app (the table owner) is the only reader either way; the switch removes the endpoint altogether, including for the service-role key M5 adds for Storage, which bypasses RLS.
2. **Set a database password you hold**: Project Settings → Database → **Reset database password**, using `openssl rand -hex 24` (letters and digits only, so the connection string needs no URL-encoding). Supabase never shows it again, so save it in your password manager first.
3. **Copy two connection strings** from the dashboard's **Connect** button and replace `[YOUR-PASSWORD]` in each. Vercel is IPv4-only and the direct host `db.<ref>.supabase.co` is IPv6-only (unless the paid IPv4 add-on is on), so neither variable uses the direct connection:

   | Variable | Connect → | Port | Used by |
   |---|---|---|---|
   | `DATABASE_URL` | Transaction pooler | 6543 | the app, per request |
   | `DIRECT_DATABASE_URL` | Session pooler | 5432 | `npm run db:migrate` during the Vercel build |

4. **Generate the encryption key**: `openssl rand -base64 32` → `CODES_ENCRYPTION_KEY`. Store a copy in your password manager: without it, every stored security code and status link is unreadable. A new key per stage.
5. **Set them in the stage's Vercel project** (Production scope), together with `REPOSITORY_DRIVER=postgres`, **before** merging the change that should run on Postgres. The next deploy runs `scripts/vercel-build`, which migrates the database, seeds it on staging, and then builds; a failed migration fails the deploy and the previous one keeps serving.
6. **Check it**: the build log lists `Applied 0001_create_applications` … on the first deploy, `Nothing to apply.` afterwards. On a fresh staging database it then shows `Seeded 16 applications.` the first time and `Seed already loaded.` after (a database that holds fewer gets only the missing ones). The database's Table Editor shows `applications`, `payments`, `status_history`, `status_tokens` and `schema_migrations`: sixteen seeded applications on staging (seven de-registrations and nine Neuzulassungen, one per status), empty on production, which is never seeded.

Migrations only move forward on staging and production: `db:migrate:down` refuses to run outside dev. A bad migration is fixed with a new one.

## 4. GitHub

The repo is **public**, which makes branch protection free. Keep it public, or the rules below silently stop existing — protected branches are paid on private repos, and rulesets need Team or Enterprise.

Both permanent branches are protected. `CONTRIBUTING.md` has the developer flow; this is the settings half:

| | `staging` | `main` |
|---|---|---|
| Pull request required | yes | yes |
| Approving reviews | 0 | 0 |
| Required checks | `lint, typecheck, test, build` | `lint, typecheck, test, build`, `main accepts staging only` |
| Force push / delete | blocked | blocked |
| Applies to admins | yes | yes |

**No approving review is required on either branch.** What binds: no direct push by anyone including the owner, CI required, and a feature branch cannot reach `main`. Review on `main` needs a second collaborator (authors cannot approve their own pull request), then:

```bash
gh api -X PATCH repos/mmaksi/zulexgo/branches/main/protection/required_pull_request_reviews \
  -F required_approving_review_count=1
```

**`enforce_admins` is on for both branches**, making "no direct push" real — verified by pushing to both and getting `GH006: protected branch hook declined` each time. The owner has no override: an emergency fix goes through a pull request, or protection is relaxed deliberately and in the open.

No repository secrets needed: CI builds against placeholders; both deployments run through Vercel's own Git integration.

## 5. Still to acquire

Each blocks the milestone beside it; none blocks M1.

| Item | Needed by | Note |
|---|---|---|
| Stripe keys | M4 | Two test environments: the test mode of account **`G&M Gastro Event GmbH`** (`acct_1UI72AFfyXGmFLpZ`) for dev (developers' `.env.local`) and the sandbox **`G&M Gastro Event GmbH Sandbox`** (`acct_1UI72PFkTWmWhWUM`) for staging (staging Vercel project); keys never cross between them. Dev receives webhooks via `stripe listen --forward-to localhost:3000/api/webhooks/stripe`, which prints its own signing secret. Production uses the live account, whose business verification (KYC) is still pending and must finish by M8. Enable cards in all three; Apple Pay and Google Pay run as cards. SEPA Direct Debit stays off: the app does not offer it. Claude's Stripe MCP has both: §6. |
| Verimi contract and credentials | M5 | Only if ZulexGO integrates Verimi itself — launch plan Q1–Q4. |
| Zulex integration key + confirmed base URL | M4 | Used by dev and staging — Zulex has one integration and one production environment. Ask the Zulex API team whether they can issue a separate integration key per stage (otherwise dev and staging share one), and, separately, for a signed status-change webhook — see the poller decision in the launch plan. |
| Zulex production key | M8 | |
| Resend sending domain verified | M4 | §7. |
| Domain | M4 | Until then staging runs on its `*.vercel.app` URL. |
| Vercel plan allowing per-minute Cron | once the Zulex API is back | The status poller's heartbeat. Until then nothing schedules `/api/internal/poll`. |
| AGB / Impressum / Datenschutz from a lawyer | M7 | Includes the 19.99 € processing-fee clause, the right of withdrawal (Q13), and Verimi's processing of ID and selfie data. |

## 6. Claude's Stripe MCP — both sandboxes in one connection

The Stripe MCP holds several accounts in one session and every call names the account it acts on, so dev and staging need no second server entry. Both test environments above are connected (2026-09-28), neither in live mode. To add or remove one, ask Claude for the account-management link (the MCP's `manage_stripe_accounts`).

Never add live mode to the MCP.

## 7. Resend  *(needed for M4)*

No Resend MCP is connected; Claude works from the installed Resend skills and you do the dashboard steps. Sending domain **`mail.gm-gastro.com`** created; staging's API key is in `zulexgo-staging`.

1. Sign up at resend.com and accept the data-processing terms (GDPR).
2. **API Keys → Create API Key**, permission **Sending access**, one key per stage. Staging's goes into the `zulexgo-staging` Vercel project as `RESEND_API_KEY` (Sensitive). Dev never gets one: `MAIL_DRIVER=resend` is refused in dev.
3. Set staging's `MAIL_ALLOWLIST` to the inboxes that may receive staging mail.
4. Once the domain exists: **Domains → Add Domain**, a sending subdomain such as `mail.<domain>`, region **`eu-west-1` (Ireland)** — the region cannot be changed later, and EU keeps mail data in the EU. Turn open and click tracking **off** (they rewrite the status link and track the customer). Add the SPF, DKIM and DMARC records it shows, wait for **Verified**, and tell Claude the sender address.

## 8. Switching staging to Stripe and Resend  *(M4)*

Registration stays `REGISTRATION_DRIVER=fake` while the Zulex API is down; payment and mail can switch now.

**Stripe, in the `G&M Gastro Event GmbH Sandbox`:**

1. **Developers → API keys**: copy the publishable key (`pk_test_…`) and the secret key (`sk_test_…`).
2. **Developers → Webhooks**: the endpoint exists (`we_1UKcZOFkTWmWhWUMfaW3drfH`, created 2026-09-28 through the Stripe MCP): URL `https://zulexgo-staging.vercel.app/api/webhooks/stripe`, events **`payment_intent.amount_capturable_updated`** and **`payment_intent.succeeded`** only, API version `2026-08-26.dahlia`, the one the Stripe adapter pins. Open it and copy its signing secret (**Signing secret → Reveal**, `whsec_…`). Don't add a second endpoint: each has its own secret, and the app verifies against one.
3. **Settings → Payment methods**: cards on. For Apple Pay and Google Pay, **Payment method domains → Add** every domain that shows the form: `zulexgo-staging.vercel.app` is registered (`pmd_1ULhCNFkTWmWhWUMJEzfJHCV`, created 2026-10-01 through the Stripe MCP; Apple Pay and Google Pay both `active`). No verification file is hosted: Stripe does Apple's merchant validation. SEPA Direct Debit stays off: the app does not offer it.

**Vercel, project `zulexgo-staging`, environment Production** (secrets Sensitive):

```
PAYMENT_DRIVER=stripe
STRIPE_SECRET_KEY=sk_test_…                       # Sensitive
STRIPE_WEBHOOK_SECRET=whsec_…                     # Sensitive
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…
MAIL_DRIVER=resend
MAIL_FROM=ZulexGO <status@mail.gm-gastro.com>
MAIL_ALLOWLIST=<the inboxes staging may mail, comma-separated>
```

`RESEND_API_KEY` is already set (§7). Redeploy `staging`; the app refuses to boot if one of these is missing. Mail only goes out once Resend shows `mail.gm-gastro.com` as **Verified**.

**Checked 2026-09-30 (names only, through the Vercel connector):** `zulexgo-staging` holds `APP_ENV`, `APP_BASE_URL`, `CRON_SECRET`, the five driver variables, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_ALLOWLIST`, `DATABASE_URL`, `DIRECT_DATABASE_URL`, `CODES_ENCRYPTION_KEY` and the three `SUPABASE_STORAGE_*`; no `ZULEX_*`, which `REGISTRATION_DRIVER=fake` does not need. That is everything `src/config/env.ts` requires for these drivers, and M6 added no variable. Migrations `0006` and `0007` run by themselves on the next deploy of `staging` (`scripts/vercel-build`).

**Dev** (`.env.local`), for a real Stripe checkout on a laptop: `PAYMENT_DRIVER=stripe` with the keys of the test mode of `G&M Gastro Event GmbH`, and the secret `stripe listen --forward-to localhost:3000/api/webhooks/stripe` prints as `STRIPE_WEBHOOK_SECRET`. Without them dev runs a simulated payment. Mail stays on the console.

## 9. Document storage  *(M5)*

The KBA's confirmation is cached in a private Supabase Storage bucket and streamed to the customer only behind their status link (`docs/launch-plan.md` M5). Per stage, in the stage's own Supabase project.

**Staging, done (2026-09-29, through the Supabase and Vercel MCPs at Mark's request):**

- Bucket **`kba-documents`** in `zulexgo-staging` (`nkojumzoqtqmkzxbpmil`): private, 10 MB per file. `storage.objects` has row-level security on and no policy, so only a secret key reads or writes it.
- In the Vercel project `zulexgo-staging`, environment Production: `SUPABASE_STORAGE_URL=https://nkojumzoqtqmkzxbpmil.supabase.co` and `SUPABASE_STORAGE_BUCKET=kba-documents`.

**Staging, still to do by hand:**

1. Supabase → `zulexgo-staging` → Project Settings → API Keys → **Publishable and secret API keys** → create a secret key named `zulexgo-staging-documents` (its own name, so it can be rotated alone). Copy the `sb_secret_…` value.
2. Vercel → `zulexgo-staging` → Settings → Environment Variables → `SUPABASE_STORAGE_SERVICE_KEY` = that value, environment **Production** only, marked **Sensitive**.
3. Change `STORAGE_DRIVER` from `fake` to `supabase` in the same place. **Only after step 2**: the app refuses to boot with the driver switched on and the key missing.
4. Redeploy `staging`. The build log shows `Seeded 1 documents.` on the first deploy (the test confirmation of the seeded completed order, stored in the bucket) and `Seed already loaded.` after. A wrong key or bucket fails the deploy, so the previous one keeps serving.
5. Check: open `https://zulexgo-staging.vercel.app/status/seed-status-link-completed` and download the test confirmation. In the Supabase dashboard, Storage → `kba-documents` holds `ZG-SEED04/9100000000000004.confirmation`. If the seeded link says "Link nicht gültig", someone used the resend form on the seeded order (its reference and address are in the repo); the next deploy restores it.

**Production** (M8): the same in the production Supabase project, with its own bucket and its own secret key; never seeded.

The secret key bypasses row-level security. It stays server-side (`SUPABASE_STORAGE_SERVICE_KEY` has no `NEXT_PUBLIC_` twin), and `tests/integration/client-bundle-secrets.test.ts` walks the client import graph to keep it so.

---

## Rotating a secret

Change it in the Vercel project and redeploy. If rotation ever needs a code change, the config layer is wrong.
