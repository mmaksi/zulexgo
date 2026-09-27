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
| Identity (Verimi) | fake | fake until M5, then Verimi | Verimi |
| Database | in-memory, seeded at boot | Supabase project (Frankfurt) | separate Supabase project (Frankfurt) |
| Document storage | in-memory | Storage in the staging Supabase project (from M5) | Storage in the production Supabase project |
| Money | none | none | real |

Two Vercel **projects**, not two branches of one: secrets are scoped per project, so production physically cannot read a staging key. The `environments` skill requires this separation; one project cannot give it.

---

## 1. Vercel — staging  *(needed for M1; not created yet as of 2026-09-27)*

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

   Payment, registration, mail and storage stay fake because those vendors come later: M4 flips payment, registration and mail, M5 storage. The app refuses to boot if a driver is flipped without its key.

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
5. **Set them in the stage's Vercel project** (Production scope), together with `REPOSITORY_DRIVER=postgres`, **before** merging the change that should run on Postgres. The next deploy runs `scripts/vercel-build`, which migrates the database and then builds; a failed migration fails the deploy and the previous one keeps serving.
6. **Check it**: the build log lists `Applied 0001_create_applications` … on the first deploy, `Nothing to apply.` afterwards. The database's Table Editor shows `applications`, `payments`, `status_history`, `status_tokens` and `schema_migrations`, all empty. Staging is never seeded.

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
| Stripe keys | M4 | Two sandboxes exist: `dev` (developers' `.env.local`) and `staging` (staging Vercel project); keys never cross between them. Dev receives webhooks via `stripe listen --forward-to localhost:3000/api/webhooks/stripe`, which prints its own signing secret. Production uses the live account, whose business verification (KYC) is still pending and must finish by M8. Enable card, SEPA Direct Debit, Apple Pay, Google Pay in all three; SEPA needs extra business verification in Stripe. |
| Verimi contract and credentials | M5 | Only if ZulexGO integrates Verimi itself — launch plan Q1–Q4. |
| Zulex integration key + confirmed base URL | M4 | Used by dev and staging — Zulex has one integration and one production environment. Ask the Zulex API team whether they can issue a separate integration key per stage (otherwise dev and staging share one), and, separately, for a signed status-change webhook — see the poller decision in the launch plan. |
| Zulex production key | M8 | |
| Resend account, verified sending domain | M4 | SPF/DKIM on the domain below. |
| Domain | M4 | Until then staging runs on its `*.vercel.app` URL. |
| Vercel plan allowing per-minute Cron | M4 | The status poller's heartbeat. |
| AGB / Impressum / Datenschutz from a lawyer | M7 | Includes the 19.99 € processing-fee clause, the right of withdrawal (Q13), and Verimi's processing of ID and selfie data. |

---

## Rotating a secret

Change it in the Vercel project and redeploy. If rotation ever needs a code change, the config layer is wrong.
