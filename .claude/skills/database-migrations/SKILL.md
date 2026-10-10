---
name: database-migrations
description: Use when changing the database schema or seeding data - every migration gets its own folder with up/down SQL, and dev and staging data come from the idempotent seed, never from hand-edited rows
---

# Database Migrations and Seeding

## Overview

Schema changes are code: reviewed, versioned, reversible, and applied the same way in every environment that has a database. Dev data is generated, never handcrafted.

**Core principle:** a merged migration is immutable. You fix a mistake with a new migration, never by editing the old one.

## One folder per migration

```
db/migrations/
  0001_create_applications/
    up.sql
    down.sql
    README.md
  0002_create_payments/
    up.sql
    down.sql
    README.md
```

Folder name: `<NNNN>_<snake_case_slug>` — zero-padded 4-digit sequence, then what it does. The number is assigned at merge time; if two branches both claim `0013`, the second to merge renumbers. The runner enforces it: a number that is not the folder's position (a gap or a duplicate), or a folder missing `up.sql`, `down.sql` or `README.md`, is an error.

| File | Contents |
|---|---|
| `up.sql` | The forward change. Idempotent where the dialect allows (`IF NOT EXISTS`). |
| `down.sql` | The exact inverse. If a change is genuinely irreversible, `down.sql` must say so in a comment and fail loudly rather than silently doing nothing. |
| `README.md` | Three lines: why this change, what breaks without it, and whether it is safe to run against a live table. |

A migration folder with no `down.sql` does not pass review, and the runner refuses it.

## Rules

1. **Never edit a migration that has been merged.** It has already run somewhere. Write `0013_fix_0012_column_type/`.
2. **One logical change per migration.** "Add table + backfill + drop old column" is three migrations, and the drop ships in a later release than the backfill.
3. **Expand, migrate, contract.** Add the new column, deploy code that writes both, backfill, then drop the old one — so a rollback never lands on a schema the previous release cannot read.
4. **No data manipulation in a schema migration** beyond a backfill that the schema change requires. Business data fixes are scripts, and they are reviewed separately.
5. **Destructive statements need an explicit note in `README.md`** and are never combined with anything else.
6. Migrations run identically in CI, staging, and production — same files, same order, same runner. Dev has no database by default: it runs the in-memory repository. CI's Postgres service container rehearses every migration; staging is the rehearsal against a real Supabase project; if it did not run there, it does not run in production.

## Seeding

```
db/seed/
  seed.ts          # entry point — the data for dev and staging (seedFor, seedPaymentsFor, seedDocumentsFor), and loadSeed() / loadDocuments() for a database
  data/
    applications.ts  # one order per status each service passes through
    payments.ts      # where each order's money stands, for the fake payment provider
    documents.ts     # the confirmation of each completed order
```

The composition root loads the seed into the in-memory repository, the fake payment provider and the in-memory document store at every boot, so every restart starts from the same data. Staging, which runs on Postgres, gets it from `npm run db:seed` on every deploy. Rules:

- **Dev and staging only.** `seed.ts` throws when `APP_ENV` is `production`, which is never seeded — see the `environments` skill.
- **Idempotent.** Loading twice produces the same data, not duplicates: keyed by reference. On a database, a seeded row that already exists is left alone, so changes made while testing on staging survive the next deploy.
- **Deterministic.** Fixed IDs and a seeded RNG, so a bug found against seed data is reproducible by everyone.
- **Obviously fake.** Security codes, VINs, plates, emails, and tokens must be recognisable as test data (`AAA111`, `example.test`). Never copy a real value from a production payload or a support ticket into seed data.
- **Covers the states, not just the happy path.** Seed at least one application in every value of `APPLICATION_STATUSES` (`src/core/domain/application/application-status.ts`); `db/seed/seed.test.ts` iterates the list, and each service's journey table (`JOURNEYS` in `db/seed/data/applications.ts`) is a `Record` over its statuses, so a new status fails to compile until it is seeded. Statuses 2 and 3 (`awaiting_identity_verification`, `identity_verified`) are the exception: only a service that verifies identity (`requiresIdentityVerification`) passes through them, so the de-registration journey table leaves them out and they are seeded with that service's orders. If a developer cannot see every UI state right after starting the dev server, the seed is incomplete.
- Seed data is not test fixtures. Jest fixtures live in `tests/fixtures/`; do not import one from the other.

## Running migrations

The runner is `src/adapters/repository/postgres/migrator.ts`; the npm scripts call `scripts/db.ts`, which reads the environment through `src/config/database.ts`:

| Command | Does |
|---|---|
| `npm run db:migrate` | Applies every pending migration, in order, one transaction each. Refuses to run if a migration that already ran has changed on disk. |
| `npm run db:migrate:down -- [count \| all]` | Reverts the latest one (or `count`, or all). **Dev only**: it refuses on staging and production. |
| `npm run db:status` | Lists each migration as applied (with its time) or pending. |
| `npm run db:seed` | Loads the seed, adding only the applications that are missing (and, with `STORAGE_DRIVER=supabase`, the missing documents). Refuses production. |

They connect over `DIRECT_DATABASE_URL` and need `REPOSITORY_DRIVER=postgres`. A stage's Vercel build runs `db:migrate` after `next build` (`scripts/vercel-build`, when `REPOSITORY_DRIVER=postgres`; a preview deploy carries no database credentials and runs neither), and staging's also runs `db:seed`, so a deployed stage is always migrated and seeded by its own deploy, never by hand.

## Checklist

1. `db/migrations/<next>_<slug>/` with `up.sql`, `down.sql`, `README.md`.
2. Up, down, up must all succeed — CI rehearses this against its Postgres service container; run it locally against any Postgres if you want it sooner.
3. Update the seed if the schema change adds a state the UI can render.
4. Update repository adapters and their contract tests (`external-services`).
5. Rehearse on staging before production.
