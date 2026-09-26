---
name: environments
description: Use when reading config, adding an env var, choosing which adapter or API base URL to use, or deciding what is safe to run where - defines the dev, staging, and production stages and the guardrails between them
---

# Environments — dev, staging, production

## Overview

Three stages, three purposes. Code is identical in all three; only configuration differs.

| Stage | Purpose | Data | Money |
|---|---|---|---|
| **dev** | Build and debug locally. Fast and disposable. | In-memory, seeded at boot, gone on restart | None — Stripe `dev` sandbox |
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
| `RegistrationGateway` (Zulex) | `https://integration-zulex.de/zulex-api/v1` (from M4) | `https://integration-zulex.de/zulex-api/v1` | `https://app.zulex.de/zulex-api/v1` |
| `PaymentProvider` | Stripe sandbox `dev` (from M4) | Stripe sandbox `staging` | Stripe **live** account |
| `Mailer` | Console or local mail catcher — never sends | Resend, recipients restricted to an allowlist | Resend |
| `DocumentStore` | In-memory fake | Supabase Storage, staging project (from M5) | Supabase Storage, production project |
| `IdentityVerification` | Fake | Fake until M5, then Verimi — details pending launch plan Q1–Q3 | Verimi |
| `ApplicationRepository` (database) | In-memory fake, seeded at boot | Supabase Postgres, staging project: migrated, not seeded | Supabase Postgres, production project: migrated, backed up |
| `Clock` / `TokenGenerator` | Real — tests inject the fakes directly | Real | Real |

Before M4 the Stripe and Zulex adapters don't exist, so every stage except production runs their fakes. The fakes stay available as driver values outside production (e.g. to force a 5b or a 429 locally) and are what tests use.

The Zulex integration and production base URLs come from the API spec. Zulex has only these two: production uses the production host, dev and staging the integration host. Stripe has three separate environments, one per stage — two sandboxes and the live account — so a key never works outside its stage.

## Guardrails

These are code, not policy — each one is a startup assertion or a runtime check with a test:

- The seed loads only when `APP_ENV=dev`; seeding any other stage throws.
- A **live** Stripe key throws at boot unless `APP_ENV=production`; a **test** key throws in production.
- `ZULEX_BASE_URL` must be the production host when `APP_ENV=production` and the integration host otherwise.
- Destructive scripts (reset, truncate, drop) refuse to run when `APP_ENV` is not `dev`.
- Outbound email is hard-blocked in dev (`MAIL_DRIVER` must be `console`) and allowlisted in staging, so a seeded address can never be mailed for real.
- Debug output, verbose error bodies, and any dump of a request payload are `dev`-only. Security codes and status tokens are never logged in any stage (see CLAUDE.md non-negotiables).

## Secrets

- `.env.local` for dev only; it is gitignored and never committed. `.env.example` lists every variable — blank, or set to its dev value — under a comment saying what it is and when it is required, and is committed. Blank means unset.
- Staging and production secrets live in the deployment platform, never in the repo, and are not shared between stages — a staging key must not work in production.
- Rotating a secret is a config change, not a code change. If rotating requires a deploy, the config layer is wrong.
- Any value prefixed `NEXT_PUBLIC_` is in the client bundle. The Zulex `X-Api-Key` and every Stripe secret key must never carry that prefix; only the Stripe publishable key may.

## Adding an environment variable

1. Add it to the zod schema in `src/config/` with a type and, if it is not a secret, a default.
2. Add it to `.env.example` with a placeholder and a comment.
3. Set it in every stage that needs it, including CI.
4. If it changes which adapter is used, wire it in the composition root — not at the call site.
5. If it is a secret, confirm it has no `NEXT_PUBLIC_` prefix and is absent from client bundles.
