---
name: project-structure
description: Use when creating a file, deciding where code belongs, or reviewing whether a module sits in the right layer - defines the folder tree, the purpose of each folder, and the dependency rules between them
---

# Project Structure

## Overview

Every folder has one purpose and one allowed set of dependencies. If you cannot name the folder a file belongs in, the file is doing two jobs.

**Core principle:** dependencies point inward. `app/` may depend on `core/`; `core/` may depend on nothing but itself.

## The tree

```
app/                    Next.js App Router. Routing, layouts, pages, route handlers ONLY.
  (marketing)/          Route group: landing + legal pages. No URL segment.
  (funnel)/             Route group: the de-registration funnel.
  status/[token]/       Account-free status dashboard.
  api/                  Route handlers — webhooks and client-callable endpoints.
  _components/          Route-local, non-routable UI (underscore = never a route).
  globals.css           Tailwind v4 entry + @theme tokens.

src/
  core/                 The application. No framework, no SDK, no I/O. Pure TypeScript.
    domain/             Entities and value objects: LicencePlate, SecurityCode, Application, Money.
    ports/              Interfaces the core requires of the outside world. See `external-services`.
    use-cases/          One file per business operation: submit-deregistration.ts, advance-status.ts.
    errors/             Domain error types the whole app throws and maps.
  adapters/             Implementations of ports. One folder per capability, then per vendor.
    payment/stripe/     |  payment/fake/
    registration/zulex/ |  registration/fake/
    mail/ storage/ clock/ tokens/
  config/               Env parsing (zod), the composition root, environment detection.
  ui/                   Design-system components, shared across routes. See `docs/design-standard.md`.
  lib/                  Genuinely generic helpers with no domain knowledge. Keep small.

db/
  migrations/           One folder per migration. See `database-migrations`.
  seed/                 Dev-only mock data. See `database-migrations`.

tests/
  integration/          Cross-module flow tests, named for the flow.
  fixtures/             Shared payloads. Never duplicate a Zulex payload inline.
  msw/                  Network-boundary handlers for Zulex and Stripe.

docs/                   Authoritative specs. Listed in CLAUDE.md.
public/                 Static assets. Stays at repo root (Next.js requirement).
```

Config files (`package.json`, `next.config.ts`, `tsconfig.json`, `.env.*`) stay at the repo root.

## Dependency rules

| Layer | May import | Must never import |
|---|---|---|
| `app/` | `src/core/**`, `src/ui/**`, `src/config/**` | vendor SDKs, `src/adapters/**` directly |
| `src/core/` | `src/core/**` only | anything in `app/`, `adapters/`, `ui/`, `next/*`, `react`, any SDK |
| `src/adapters/` | `src/core/ports/**`, `src/core/domain/**`, its own SDK | other adapters, `app/`, `src/ui/` |
| `src/config/` | everything (it is the composition root) | — |
| `src/ui/` | `src/ui/**`, `react` | `src/core/use-cases/**`, adapters, SDKs |

`src/core/` importing `next` or `react` is the single most common drift in this codebase's shape. It means business logic has been welded to the framework; move it out.

## Naming

- Files and folders: `kebab-case.ts`. One primary export per file, named after the file.
- Use cases read as verbs: `submit-deregistration.ts`, not `deregistrationService.ts`.
- Ports read as roles: `payment-provider.ts`, not `stripe-service.ts`.
- Tests sit next to their subject (`x.ts` → `x.test.ts`); integration tests live in `tests/integration/`.
- Path alias: `@/*` maps to the repo root, so `@/src/core/...` and `@/app/...`.

## Next.js specifics worth knowing

Verified against `node_modules/next/dist/docs/`:

- A folder in `app/` is not routable until it contains `page.tsx` or `route.ts`, so colocation is safe.
- `_folder` (underscore) is explicitly non-routable — use it for route-local components.
- `(group)` route groups organise without adding a URL segment.
- **`src/app` is ignored when `app/` exists at the root.** This project keeps `app/` at the root, so `src/` is an ordinary source folder. Do not move `app/` into `src/` without also updating the alias config.

## When something does not fit

Do not create a `utils/`, `helpers/`, `shared/`, or `misc/` folder. Those are where structure goes to die. Either the code is domain logic (`core/`), an outside-world detail (`adapters/`), presentation (`ui/`), or genuinely generic and dependency-free (`lib/`). If none fits, the code is probably two things — split it.
