---
name: database-migrations
description: Use when changing the database schema or seeding data - every migration gets its own folder with up/down SQL, and dev data comes from the idempotent seed loaded into the in-memory repository, never from hand-edited rows
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
  0002_add_status_history/
    up.sql
    down.sql
    README.md
```

Folder name: `<NNNN>_<snake_case_slug>` — zero-padded 4-digit sequence, then what it does. The number is assigned at merge time; if two branches both claim `0007`, the second to merge renumbers.

| File | Contents |
|---|---|
| `up.sql` | The forward change. Idempotent where the dialect allows (`IF NOT EXISTS`). |
| `down.sql` | The exact inverse. If a change is genuinely irreversible, `down.sql` must say so in a comment and fail loudly rather than silently doing nothing. |
| `README.md` | Three lines: why this change, what breaks without it, and whether it is safe to run against a live table. |

A migration folder with no `down.sql` does not pass review.

## Rules

1. **Never edit a migration that has been merged.** It has already run somewhere. Write `0009_fix_0008_column_type/`.
2. **One logical change per migration.** "Add table + backfill + drop old column" is three migrations, and the drop ships in a later release than the backfill.
3. **Expand, migrate, contract.** Add the new column, deploy code that writes both, backfill, then drop the old one — so a rollback never lands on a schema the previous release cannot read.
4. **No data manipulation in a schema migration** beyond a backfill that the schema change requires. Business data fixes are scripts, and they are reviewed separately.
5. **Destructive statements need an explicit note in `README.md`** and are never combined with anything else.
6. Migrations run identically in CI, staging, and production — same files, same order, same runner. Dev has no database: it runs the in-memory repository. CI's Postgres service container rehearses every migration; staging is the rehearsal against a real Supabase project; if it did not run there, it does not run in production.

## Seeding

```
db/seed/
  seed.ts          # entry point — loads the data into the in-memory repository
  data/
    applications.ts
    documents.ts
```

The dev composition root loads the seed into the in-memory repository at boot, so every restart starts from the same data. Rules:

- **Dev only.** `seed.ts` throws unless `APP_ENV` is `dev`. Staging and production are never seeded — see the `environments` skill.
- **Idempotent.** Loading twice produces the same data, not duplicates: upsert on a stable key.
- **Deterministic.** Fixed IDs and a seeded RNG, so a bug found against seed data is reproducible by everyone.
- **Obviously fake.** Security codes, VINs, plates, emails, and tokens must be recognisable as test data (`AAA111`, `example.test`). Never copy a real value from a production payload or a support ticket into seed data.
- **Covers the states, not just the happy path.** Seed at least one application in each status the status dashboard renders: the seven customer statuses in `docs/launch-plan.md` (submitted & paid, awaiting identity verification, identity verified, submitted to KBA, completed, failed-correctable, failed-final) plus cancelled. If a developer cannot see every UI state right after starting the dev server, the seed is incomplete.
- Seed data is not test fixtures. Jest fixtures live in `tests/fixtures/`; do not import one from the other.

## Checklist

1. `db/migrations/<next>_<slug>/` with `up.sql`, `down.sql`, `README.md`.
2. Up, down, up must all succeed — CI rehearses this against its Postgres service container; run it locally against any Postgres if you want it sooner.
3. Update the seed if the schema change adds a state the UI can render.
4. Update repository adapters and their contract tests (`external-services`).
5. Rehearse on staging before production.
