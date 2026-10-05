---
name: environments
description: Use when reading config, adding an env var, choosing which adapter or API base URL to use, or deciding what is safe to run where - defines the dev, staging, and production stages and the guardrails between them
---

# Environments — dev, staging, production

## Overview

Three stages, three purposes. Code is identical in all three; only configuration differs.

| Stage | Purpose | Data | Money |
|---|---|---|---|
| **dev** | Build and debug locally. Fast and disposable. | In-memory, seeded at boot, gone on restart | None — Stripe test mode |
| **staging** | Rehearse production. Verify a release against real external systems before it ships. | Real-shaped, non-production; seeded with the same fake applications as dev | Stripe **test** mode only |
| **production** | Serve real customers. | Real personal data — GDPR applies | Real charges |

**Core principle:** staging exists to be the last place a mistake is cheap. If a change has not run on staging, it does not go to production.

## `APP_ENV`, not `NODE_ENV`

`next build` sets `NODE_ENV=production` for *any* production build — including the one deployed to staging. Never branch on `NODE_ENV` to decide behaviour.

```
APP_ENV = dev | staging | production
```

`APP_ENV` is the only stage switch: it decides base URLs and guardrails. Each port's adapter is chosen by its own `*_DRIVER` variable (the fake or console adapter by default), which the guardrails constrain per stage. Every variable is read once, in `src/config/`, validated with zod at boot, and exposed as a typed object. Nothing else reads `process.env` directly.

Fail fast: if a required variable is missing or malformed, the process exits at startup with the variable name. Never fall back to a default for a secret, and never `?? ''`.

## What each stage wires up

Selected in the composition root (see `external-services`).

| Port | dev | staging | production |
|---|---|---|---|
| `RegistrationGateway` (Zulex) | `https://integration-zulex.de/zulex-api/v1` (from M4) | `https://integration-zulex.de/zulex-api/v1` | `https://app.zulex.de/zulex-api/v1` |
| `PaymentProvider` | Stripe test mode of the `G&M Gastro Event GmbH` account (from M4) | Stripe sandbox `staging` | Stripe **live** account |
| `Mailer` | Console or local mail catcher — never sends | Resend, recipients restricted to an allowlist | Resend |
| `DocumentStore` | In-memory fake | Supabase Storage, staging project (from M5) | Supabase Storage, production project |
| `IdentityVerification` (`IDENTITY_DRIVER`) | Fake | Fake | Fake while no service on sale verifies the customer (de-registration); Verimi, added later (launch plan Q1–Q4), is required before one does |
| `ApplicationRepository` (database) | In-memory fake, seeded at boot | Supabase Postgres, staging project: migrated and seeded by every deploy | Supabase Postgres, production project: migrated, backed up |
| `RateLimiter` (no driver of its own: follows `REPOSITORY_DRIVER`) | In-memory fake | Postgres, with the repository | Postgres, with the repository |
| `Clock` / `TokenGenerator` | Real — tests inject the fakes directly | Real | Real |

The Stripe and Zulex adapters exist, and every `*_DRIVER` defaults to its fake (`.env.example`), so a stage runs a fake until its driver and credentials are set. The fakes stay available as driver values outside production (e.g. to force a 5b or a 429 locally) and are what tests use.

The Zulex integration and production base URLs come from the API spec. Zulex has only these two: production uses the production host, dev and staging the integration host. Stripe has three separate environments, one per stage — two sandboxes and the live account — so a key never works outside its stage.

## Guardrails

These are code, not policy — each one is a startup assertion or a runtime check with a test:

- Production refuses every fake: `PAYMENT_DRIVER`, `REGISTRATION_DRIVER`, `REPOSITORY_DRIVER` and `STORAGE_DRIVER` may not be `fake` there, nor `MAIL_DRIVER` `console` (the identity check has its own rule below).
- Outside dev, `APP_BASE_URL` (https only, since status links travel over it) and `CRON_SECRET` are required.
- The seed never loads in production; seeding production throws.
- A **live** Stripe key throws at boot unless `APP_ENV=production`; a **test** key throws in production.
- `ZULEX_BASE_URL` must be the production host when `APP_ENV=production` and the integration host otherwise.
- Destructive scripts (`db:migrate:down`, and any reset or truncate) refuse to run when `APP_ENV` is not `dev`.
- Production refuses the fake identity check (`IDENTITY_DRIVER=fake`) once a service that verifies the customer (`requiresIdentityVerification`) is in the stage's `SERVICES_ON_SALE` setting: a fake proves nobody's identity, and the KBA registers a car in the name the order gives. De-registration alone needs none.
- Outbound email is hard-blocked in dev (`MAIL_DRIVER` must be `console`) and allowlisted in staging (a staging `MAIL_DRIVER` other than `console` needs a non-empty `MAIL_ALLOWLIST`), so a seeded address can never be mailed for real. In production `MAIL_ALLOWLIST` must be empty: a list there silently drops customer mail.
- Debug output, verbose error bodies, and any dump of a request payload are `dev`-only. Security codes are never logged in any stage. Status tokens are logged only in dev, where the console mailer prints the status link; everywhere else it masks them (see CLAUDE.md non-negotiables). The same goes for the link that starts an identity verification.

## What a stage sells

`SERVICES_ON_SALE` (default `deregistration`) is a setting like any other: the landing cards, the funnel routes and `submitCheckout` follow it, so staging can sell a service on fakes while production still refuses it. `BETA_SERVICES` puts services of that list behind invite codes (`INVITE_CODES_DEREGISTRATION`, `INVITE_CODES_NEW_REGISTRATION`, secrets) with `BETA_DAILY_CAP` checkouts a day; the environment refuses a beta service with no codes, codes for a service not in beta (it would be open to everyone) and a code shorter than 8 characters. The landing page is static, so its cards take these settings when it is built.

## Secrets

- `.env.local` for dev only; it is gitignored and never committed. `.env.example` lists every variable — blank, or set to its dev value — under a comment saying what it is and when it is required, and is committed. Blank means unset.
- Staging and production secrets live in the deployment platform, never in the repo, and are not shared between stages — a staging key must not work in production.
- Rotating a secret is a config change, not a code change.
- Any value prefixed `NEXT_PUBLIC_` is in the client bundle. The Zulex `X-Api-Key` and every Stripe secret key must never carry that prefix; only the Stripe publishable key may.

## Adding an environment variable

1. Add it to the zod schema in `src/config/` with a type and, if it is not a secret, a default.
2. Add it to `.env.example` with a placeholder and a comment.
3. Set it in every stage that needs it, including CI.
4. If it changes which adapter is used, wire it in the composition root — not at the call site.
5. If it is a secret, confirm it has no `NEXT_PUBLIC_` prefix and is absent from client bundles.
