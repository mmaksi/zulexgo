# Provisioning — what to create, once, by hand

The repository is stage-agnostic: `APP_ENV` and the variables in `.env.example`
are the whole configuration surface. This document is the click-by-click other
half, and it is the only place that records which accounts exist and who owns
them. `docs/launch-plan.md` says *when* each item is needed; this says *how*.

Nothing here belongs in code, and no value from here belongs in git.

---

## The shape

| | dev | staging | production |
|---|---|---|---|
| Where | your laptop | Vercel project `zulexgo-staging` | Vercel project `zulexgo` |
| Git branch | — | `staging` | `main` |
| `APP_ENV` | `dev` | `staging` | `production` |
| Deploys | — | automatically, on every merge to `staging` | automatically, on every merge to `main` — which only `staging` may merge into, after review |
| Zulex | fake | integration host, then real key | production host |
| Stripe | fake | test mode | live mode |
| Mail | console | real provider, allowlisted recipients | real provider |
| Database | local / fake | Supabase project (Frankfurt) | separate Supabase project (Frankfurt) |
| Money | none | none | real |

Two Vercel **projects**, not two branches of one, because secrets are scoped per
project: a staging key then physically cannot be read by production. That
separation is what the `environments` skill requires and what one project cannot
give.

---

## 1. Vercel — staging  *(needed for M1)*

1. New Project → import `mmaksi/zulexgo` → name it **`zulexgo-staging`**.
2. Framework preset: Next.js. Root directory: repository root.
3. Production Branch: **`staging`**. Every merge to `staging` deploys here.
4. Settings → Functions → Region: **Frankfurt (fra1)**. Already pinned by
   `vercel.json`, so this only needs checking.
5. Settings → Environment Variables, for the Production scope of *this project*:

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

   Fakes for now: the vendor credentials do not exist yet, and staging must be
   deployable before they do. Each `fake` flips to its real driver in the
   milestone that earns it (M3 repository, M4 payment/registration/mail, M5
   storage), and the app refuses to boot if a driver is flipped without its key.

6. Deploy. The marketing site must serve at the assigned URL.
7. Come back and set `APP_BASE_URL` to that URL, then redeploy — it is not known
   until the project exists.

## 2. Vercel — production  *(needed for M8, create it now if convenient)*

Same import, named **`zulexgo`**, with one difference: set **Production Branch**
to **`main`**.

Nothing reaches `main` except a reviewed pull request from `staging` that passed
CI — that is what branch protection enforces, so the deploy needs no gate of its
own. See `CONTRIBUTING.md` for the flow.

Leave the project's environment variables empty until M8; a half-configured
production project that boots is worse than one that refuses to.

## 3. Supabase

One project per stage, region **Frankfurt (eu-central-1)** — EU residency is a
GDPR requirement, not a preference.

- **Staging** — exists. Its `DATABASE_URL` (Supavisor pooler, *transaction*
  mode) and `DIRECT_DATABASE_URL` (direct connection, migrations only) go into
  the staging Vercel project in **M3**, when the schema lands, together with
  `REPOSITORY_DRIVER=postgres` and a `CODES_ENCRYPTION_KEY`.
- **Production** — create in M8. Never share a connection string between stages.

No Supabase Auth (there are no accounts by design), no client-side Supabase SDK,
no RLS-based access: this application is the database's only client, and it
reaches it server-side only.

## 4. GitHub

The repository is **public**, which is what makes branch protection free. Keep it
that way, or the rules below silently stop existing — protected branches are a
paid feature on private repositories, and rulesets need Team or Enterprise.

Both permanent branches are protected. `CONTRIBUTING.md` states the flow for
developers; this is the settings half:

| | `staging` | `main` |
|---|---|---|
| Pull request required | yes | yes |
| Approving reviews | 0 | 1 |
| Required checks | `lint, typecheck, test, build` | `lint, typecheck, test, build`, `main accepts staging only` |
| Force push / delete | blocked | blocked |
| Applies to admins | no — see below | no — see below |

**`enforce_admins` is off, deliberately.** With one GitHub account on the
project, turning it on makes `main` permanently unmergeable: the single required
approval cannot come from the author of the pull request. Turn it on the day a
second reviewer exists:

```bash
gh api -X POST repos/mmaksi/zulexgo/branches/main/protection/enforce_admins
gh api -X POST repos/mmaksi/zulexgo/branches/staging/protection/enforce_admins
```

Until then the rules bind every collaborator, and the owner can override in an
emergency. That is a real gap, not a formality — it is written down here so it is
a decision rather than a surprise.

No repository secrets are needed: CI builds against placeholders, and both
deployments run through Vercel's own Git integration.

## 5. Still to acquire

Each blocks the milestone named beside it; none blocks M1.

| Item | Needed by | Note |
|---|---|---|
| Stripe account, test keys | M4 | Test keys are free and immediate. Live activation (KYC) is separate and lands in M8. |
| Zulex integration key + confirmed base URL | M4 | Ask the Zulex API team for the integration credential and, separately, for a signed status-change webhook — see the poller decision in the launch plan. |
| Zulex production key | M8 | |
| Resend account, verified sending domain | M4 | SPF/DKIM on the domain below. |
| Domain | M4 | Until it exists, staging runs on its `*.vercel.app` URL. |
| Vercel plan allowing per-minute Cron | M4 | The status poller's heartbeat. |
| AGB / Impressum / Datenschutz from a lawyer | M7 | |

---

## Rotating a secret

Change it in the Vercel project and redeploy. If rotating ever requires a code
change, the config layer is wrong.
