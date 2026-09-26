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
| Zulex | fake | integration host, then real key | production host |
| Stripe | fake | test mode | live mode |
| Mail | console | Resend, allowlisted recipients | Resend |
| Identity (Verimi) | fake | fake until M5, then Verimi | Verimi |
| Database | local / fake | Supabase project (Frankfurt) | separate Supabase project (Frankfurt) |
| Money | none | none | real |

Two Vercel **projects**, not two branches of one: secrets are scoped per project, so production physically cannot read a staging key. The `environments` skill requires this separation; one project cannot give it.

---

## 1. Vercel — staging  *(needed for M1)*

1. New Project → import `mmaksi/zulexgo` → name it **`zulexgo-staging`**.
2. Framework preset: Next.js. Root directory: repository root.
3. Production Branch: **`staging`**. Every merge to `staging` deploys here.
4. Settings → Functions → Region: **Frankfurt (fra1)**. Already pinned by `vercel.json`; just check it.
5. Settings → Environment Variables, Production scope of *this project*:

   ```
   APP_ENV=staging
   APP_BASE_URL=https://<the URL Vercel assigns>
   CRON_SECRET=<openssl rand -base64 32>
   PAYMENT_DRIVER=fake
   REGISTRATION_DRIVER=fake
   MAIL_DRIVER=console
   REPOSITORY_DRIVER=fake
   STORAGE_DRIVER=fake
   ```

   Fakes because vendor credentials do not exist yet and staging must deploy before they do. Each `fake` flips to its real driver in the milestone that earns it (M3 repository, M4 payment/registration/mail, M5 storage); the app refuses to boot if a driver is flipped without its key.

6. Deploy. The marketing site must serve at the assigned URL.
7. Set `APP_BASE_URL` to that URL and redeploy — it is unknown until the project exists.

## 2. Vercel — production  *(needed for M8, create it now if convenient)*

Same import, named **`zulexgo`**, except **Production Branch** = **`main`**.

Only a pull request from `staging` that passed CI reaches `main` — branch protection enforces it, so the deploy needs no gate of its own. Flow: `CONTRIBUTING.md`.

Leave its environment variables empty until M8; a half-configured production project that boots is worse than one that refuses to.

## 3. Supabase

One project per stage, region **Frankfurt (eu-central-1)** — EU residency is a GDPR requirement, not a preference.

- **Staging** — exists. `DATABASE_URL` (Supavisor pooler, *transaction* mode) and `DIRECT_DATABASE_URL` (direct connection, migrations only) go into the staging Vercel project in **M3**, when the schema lands, with `REPOSITORY_DRIVER=postgres` and a `CODES_ENCRYPTION_KEY`.
- **Production** — create in M8. Never share a connection string between stages.

No Supabase Auth (no accounts by design), no client-side Supabase SDK, no RLS-based access: the app is the database's only client, server-side only.

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
| Stripe account, test keys | M4 | Test keys free and immediate. Live activation (KYC) is separate, in M8. Enable card, SEPA Direct Debit, Apple Pay, Google Pay; SEPA needs extra business verification in Stripe. |
| Verimi contract and credentials | M5 | Only if ZulexGO integrates Verimi itself — launch plan Q1–Q4. |
| Zulex integration key + confirmed base URL | M4 | Ask the Zulex API team for the integration credential and, separately, a signed status-change webhook — see the poller decision in the launch plan. |
| Zulex production key | M8 | |
| Resend account, verified sending domain | M4 | SPF/DKIM on the domain below. |
| Domain | M4 | Until then staging runs on its `*.vercel.app` URL. |
| Vercel plan allowing per-minute Cron | M4 | The status poller's heartbeat. |
| AGB / Impressum / Datenschutz from a lawyer | M7 | Includes the 19.99 € processing-fee clause, the right of withdrawal (Q13), and Verimi's processing of ID and selfie data. |

---

## Rotating a secret

Change it in the Vercel project and redeploy. If rotation ever needs a code change, the config layer is wrong.
