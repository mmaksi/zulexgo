---
name: environments
description: Use when reading config, adding an env var, choosing which adapter or API base URL to use, or deciding what is safe to run where - defines the dev, staging, and production stages and the guardrails between them
---

# Environments — dev, staging, production

## Overview

Three stages, three purposes. Code is identical in all three; only configuration differs.

| Stage | Purpose | Data | Money |
|---|---|---|---|
| **dev** | Build and debug locally. Fast, disposable, offline-capable. | Seeded mock data, wiped freely | None — fake or Stripe test |
| **staging** | Rehearse production. Verify a release against real external systems before it ships. | Real-shaped, non-production; never seeded | Stripe **test** mode only |
| **production** | Serve real customers. | Real personal data — GDPR applies | Real charges |

**Core principle:** staging exists to be the last place a mistake is cheap. If a change has not run on staging, it does not go to production.

## `APP_ENV`, not `NODE_ENV`

`next build` sets `NODE_ENV=production` for *any* production build — including the one deployed to staging. Never branch on `NODE_ENV` to decide behaviour.

```
APP_ENV = dev | staging | production
```

`APP_ENV` is the only switch that selects adapters, base URLs, and guardrails. It is read once, in `src/config/`, validated with zod at boot, and exposed as a typed object. Nothing else reads `process.env` directly.

Fail fast: if a required variable is missing or malformed, the process exits at startup with the variable name. Never fall back to a default for a secret, and never `?? ''`.

## What each stage wires up

Selected in the composition root (see `external-services`).

| Port | dev | staging | production |
|---|---|---|---|
| `RegistrationGateway` (Zulex) | Fake adapter by default; integration base URL when testing the real contract | `https://integration-zulex.de/zulex-api/v1` | `https://app.zulex.de/zulex-api/v1` |
| `PaymentProvider` | Fake, or Stripe test keys / stripe-mock | Stripe **test** keys | Stripe **live** keys |
| `Mailer` | Console or local mail catcher — never sends | Real provider, recipients restricted to an allowlist | Real provider |
| Database | Local Postgres, seeded | Managed instance, migrated, not seeded | Managed instance, migrated, backed up |
| `Clock` / `TokenGenerator` | Injectable/seeded for reproducibility | Real | Real |

The Zulex integration and production base URLs come from the API spec; a stage must never point at the other one's host.

## Guardrails

These are code, not policy — each one is a startup assertion or a runtime check with a test:

- `db:seed` exits non-zero unless `APP_ENV=dev`.
- A **live** Stripe key throws at boot unless `APP_ENV=production`; a **test** key throws in production.
- The production Zulex base URL is rejected unless `APP_ENV=production`.
- Destructive scripts (reset, truncate, drop) refuse to run when `APP_ENV` is not `dev`.
- Outbound email is hard-blocked in dev and allowlisted in staging, so a seeded address can never be mailed for real.
- Debug output, verbose error bodies, and any dump of a request payload are `dev`-only. Security codes and status tokens are never logged in any stage (see CLAUDE.md non-negotiables).

## Secrets

- `.env.local` for dev only; it is gitignored and never committed. `.env.example` lists every variable with a placeholder and a one-line comment, and is committed.
- Staging and production secrets live in the deployment platform, never in the repo, and are not shared between stages — a staging key must not work in production.
- Rotating a secret is a config change, not a code change. If rotating requires a deploy, the config layer is wrong.
- Any value prefixed `NEXT_PUBLIC_` is in the client bundle. The Zulex `X-Api-Key` and every Stripe secret key must never carry that prefix; only the Stripe publishable key may.

## Adding an environment variable

1. Add it to the zod schema in `src/config/` with a type and, if it is not a secret, a default.
2. Add it to `.env.example` with a placeholder and a comment.
3. Set it in every stage that needs it, including CI.
4. If it changes which adapter is used, wire it in the composition root — not at the call site.
5. If it is a secret, confirm it has no `NEXT_PUBLIC_` prefix and is absent from client bundles.
