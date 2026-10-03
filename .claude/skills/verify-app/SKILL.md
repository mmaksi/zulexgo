---
name: verify-app
description: Use before claiming any change is done, before committing, and before opening a pull request - first works out the edges of the change (inputs, state, repeats, instances, stages, dependency failures, secrets, UI states), then runs the verification loop (lint, typecheck, tests, Postgres, CI-equivalent build with the secret canary, dev-server boot, browser check) and reports what passed, failed, was skipped or can only be confirmed on staging
---

# Verify the app

## Overview

"Done" means two things, both true of the final code and not of an earlier state:

1. **The edges of this change were worked out** (step 2), not only the happy path.
2. **The loop ran green** (steps 3-10).

The loop proves only what a test or check already exercises. A change can pass every step and still be wrong: D11 passed lint, types, tests and the build, then broke on staging because dev is one process and Vercel runs many. Nothing in the loop could see that; asking "what else can this break?" could. So step 2 comes first, and the steps after it are how its answers get proven.

Run the steps fast to slow; the first failure stops the loop. Fix it, rerun that step, then rerun the whole loop once before reporting, because a fix can break an earlier step.

The loop mirrors CI (`.github/workflows/ci.yml`), and step 6 reproduces the part CI adds (the Postgres suites and the migration rehearsal). If it passes here, the `lint, typecheck, test, build` check passes there. It cannot prove what only real systems answer; see Reporting.

## The loop

### 1. Scope: is the diff what you meant?

```bash
git fetch -q origin staging
BASE=$(git merge-base HEAD origin/staging)
git status --short && git diff --stat "$BASE"
git log --oneline HEAD..origin/staging
{ git diff "$BASE" -U0 -- '*.ts' '*.tsx' '*.mjs'; git ls-files -o --exclude-standard -z -- '*.ts' '*.tsx' '*.mjs' | xargs -0 -I{} git diff --no-index -U0 -- /dev/null {}; } \
  | grep -nE '^\+[^+].*(\.only\(|\.skip\(|\bxit\(|\bxdescribe\(|console\.log|debugger|eslint-disable|@ts-(expect-error|ignore))'
```

- The stat is the whole branch against where it left `staging`, uncommitted work included. Only files the task needed, no commented-out code, no `.env*` changes. A changed `AGENTS.md` is the block `next dev` re-adds (see that file); leave it alone.
- `git log` prints nothing. A commit listed means `staging` moved, and CI tests your branch merged into it, not your branch. Bring `staging` in and rerun the loop on the result.
- The grep prints nothing, or each hit is removed or justified (a CLI script may print). It reads untracked files too, where a new test's `.only` hides.
- Blast radius: for each function, port method, type, env var, fixture or route you changed, `git grep -n` its name and open every caller and implementer. A port change reaches every adapter, the fake and the contract suite. A persisted-shape change reaches the migration, the seed, both repositories and the rows already stored.

### 2. Edges: what could this break?

Read the diff itself, not your memory of writing it. For each behaviour it changes, ask every question below and write down each edge that applies as `edge -> proof`. Skip a question only when you can say why it cannot apply. "No edge cases" on a non-trivial change means you have not looked.

- **Input and limits.** Empty, missing, whitespace, wrong case, one past each limit (plate `[A-ZÄÖÜ]{1,3}`, VIN 1-17, codes of 3 and 7, no leading 0), umlauts, hostile strings. Values the spec does not list: an unknown Zulex status shows "In progress"; an `UNKNOWN` document type or unknown alert tag does not break the page. Money: cents, rounding, a refund never below zero nor above what was paid.
- **State.** Each status the change touches (1 -> 4 -> 5a | 5b | 5c), each illegal move refused, terminal states stop polling. A crash between two steps (row written, email unsent; Stripe called, row unwritten): what is left behind, does the next tick repair it, is money left held or taken wrongly? The order of side effects (D5).
- **Repeats and order.** The same request twice (double click, refresh, webhook redelivery, overlapping cron ticks, a retry under the same idempotency key) has one effect. Events out of order (webhook before the redirect, a status change after a refund). A timeout is not a failure: the call may have succeeded (D6). 429 with `Retry-After`. Time: hold expiry, backoff, DST, a frozen `Clock`.
- **Instances.** Vercel runs many short-lived instances; dev and tests run one. Anything in memory (module state, a cache, a counter, a rate limiter, and every fake on staging) is per instance and lost on a cold start (D11). Two requests racing on one row need a unique constraint or a compare-and-set. Test it with two instances of the object, interleaved.
- **Stages.** What differs on dev, staging and production (`environments`)? A new variable parses on all three and names itself when missing; a guardrail has a test per stage; nothing branches on `NODE_ENV`; nothing works only because dev is in-memory and seeded.
- **Dependency failure.** For each outside call touched (Zulex, Stripe, Resend, Postgres, Storage): it fails, times out, answers 4xx with no body (the spec defines none), or returns an unexpected shape. What does the customer see, what is stored, what is logged, is money left wrong? Do the fake and the real adapter still agree, both passing the port's contract?
- **Secrets and privacy.** Security codes and the `X-Api-Key` appear in no log, page, email, error message, Stripe metadata, fixture or client chunk; status tokens appear in logs only in dev. A new route authenticates (cron bearer, Stripe signature over the raw body, token lookup) and answers "unknown" and "not yours" alike. Anything guessable is rate-limited, and a per-instance limit does not count (Instances). Store only what is needed.
- **Data.** Runs on a table that already has rows (nullable, default, backfill); `down.sql` reverses it; running it twice is safe; the seed stays idempotent and satisfies the new constraints; codes stay encrypted at rest.
- **UI states.** Loading, empty, error, success, disabled, and pending (double submit). Back, refresh and a deep link mid-funnel; the browser's back button after payment. Long German words and error messages, 320 px wide, keyboard only, screen-reader names, focus after a failed submit, reduced motion.
- **Docs and neighbours.** Code and `docs/launch-plan.md` still agree; if behaviour changed, change the doc that states it in the same PR (the launch plan wins). Every fact you wrote in a doc is checked against the code. Nothing was removed that something else relied on, and every place that repeats the rule (email templates, status mapping, seed, fixtures) moved with it.

Proof, per edge:

- **Logic and behaviour: a test, written first.** If it fails, you found a bug: fix it test-first. If it passes at once, prove it can fail: break the code (flip the condition, revert the fix), watch it go red, restore it. A guard that cannot fail is worse than none.
- **Presentation and infrastructure** (no test, per CLAUDE.md): a check in steps 6-10. Name which one.
- **Only a real system can answer** (live Zulex, Stripe, Resend, several Vercel instances, the cron): "confirm on staging" in the report, never "verified".

For money, status transitions, the error algorithm, secrets or migrations, get a second look, because the author is the worst at finding their own edges: run the `code-review` skill, or give an agent only the diff and this list and ask it to break the change.

### 3. Lint

```bash
npm run lint
```

Zero errors and zero warnings. Never add an `eslint-disable` to get past it; fix the code.

### 4. Typecheck

```bash
npm run typecheck
```

Runs `next typegen` first, so route types match the `app/` tree. Never silence an error with `any`, `as` or `@ts-expect-error`.

### 5. Tests

```bash
npm test -- --ci
```

All suites pass in both projects (`jsdom` and `node`). While iterating, run one file: `npm test -- path/to/file.test.ts`, but finish on the full suite.

- Read the summary, not the exit code. Without `TEST_DATABASE_URL` the Postgres suites report as **skipped** (`2 skipped` suites) and the run still exits 0. If the change touches persistence, that is a step 6 run, not a pass.
- New logic or a fix has a test, and you watched it fail before the code made it pass (`test-driven-development`). A test you never saw fail proves nothing.
- Every edge from step 2 that logic can answer has a test, the failure path included. Read your new tests as a reviewer would: they assert what the caller observes; fixtures pass the same zod schemas as production input; no real sleeps or wall clock; no real security code or token as a fixture value; no snapshot of a component tree (CLAUDE.md Testing).
- Code with shared state, time or ordering: rerun its file a few times with `npm test -- path/to/file.test.ts --randomize`. It shuffles the tests, so state leaking between them shows up.
- The suite count did not drop, and no test was skipped, deleted or loosened to go green. If a test was wrong, say so and why.

### 6. Database: only when persistence is touched

When the diff touches `db/`, `src/adapters/repository/`, the repository port, a persisted domain type such as `Application`, the seed or `src/config/database.ts`. CI always runs the Postgres suites and the migration rehearsal; locally they skip. Run them against a throwaway container (`CONTRIBUTING.md`). Port 55432 keeps it away from any Postgres you already run.

```bash
docker run -d --rm --name zulexgo-test-pg -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:17
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/postgres npm test -- --ci
```

Then the rehearsal from CI's `Migration rehearsal` step, plus a round trip with rows in place. Run it as one command, since shell state does not carry over:

```bash
export APP_ENV=dev REPOSITORY_DRIVER=postgres CODES_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
  DATABASE_URL=postgres://postgres:postgres@localhost:55432/postgres \
  DIRECT_DATABASE_URL=postgres://postgres:postgres@localhost:55432/postgres
npm run db:migrate && npm run db:migrate:down -- all && npm run db:migrate \
&& npm run db:seed && npm run --silent db:seed | grep -Fx "Seed already loaded." \
&& npm run db:migrate:down && npm run db:migrate
```

The last pair reverses and reapplies the newest migration with the seed's rows in place, which is what a real table looks like. Every suite runs (none skipped), every command exits 0, the second seed prints `Seed already loaded.`. Point this at the container and nothing else: `down` drops tables, and `APP_ENV=dev` is the only thing it checks. Then `docker stop zulexgo-test-pg`, also after a failure.

### 7. Production build, CI configuration

```bash
APP_ENV=staging APP_BASE_URL=https://ci.example.test CRON_SECRET=ci-placeholder-cron-secret \
PAYMENT_DRIVER=fake REGISTRATION_DRIVER=fake MAIL_DRIVER=console REPOSITORY_DRIVER=fake STORAGE_DRIVER=fake \
ZULEX_API_KEY=ci-canary-zulex-api-key-must-not-ship npm run build \
&& ! grep -rqF ci-canary-zulex-api-key-must-not-ship .next/static && echo "canary absent from client chunks"
```

The same env as CI. Shell variables override `.env.local`, so the build proves the staging configuration parses, not your local one. It catches what the dev server forgives: `server-only` imports reaching a client component, prerender errors, and a server secret leaking into `.next/static`. A canary hit is a security failure, not a flaky step. `next build` writes to `.next`, `next dev` to `.next/dev`, so it can run beside a dev server. Then read what it printed:

- **The route table.** `/`, `/agb`, `/datenschutz` and `/impressum` may be `○` (static). Everything that shows an order or takes a request (`/status/[token]`, `/deregister*`, `/api/*`) is `ƒ`. A `○` there is a personal page that could be cached and served to someone else. Place any route your change created on one side or the other.
- No new warning.
- **A dependency change** (`package.json`): `npm ci --dry-run` succeeds. CI installs with `npm ci`, which refuses a lockfile out of sync with `package.json`; a local `npm install` forgives it.

### 8. Dev server boots clean and answers

Start it with the preview tool, never `npm run dev` in Bash:

```
preview_start { name: "zulexgo-dev" }
```

If one is already running (`.next/dev/lock` holds its PID and URL), reuse it. Then:

- `preview_logs`: `✓ Ready`, and no error, warning, or stack trace. `instrumentation.ts` builds the container at boot, so a clean start proves the dev env parses.
- Every route answers, and an unknown one 404s:
  ```bash
  for p in / /agb /datenschutz /impressum /deregister /status/seed-status-link-submitted-to-kba /does-not-exist; do echo "$(curl -s -o /dev/null -w '%{http_code}' localhost:3000$p) $p"; done
  ```
  The status link is one the dev seed opens. `/api/webhooks/stripe` and `/api/internal/poll` are exercised by the integration tests, not here. Add any route your change created.
- If the change touched a route handler or server action, call it: a correct request, missing and wrong credentials, a malformed body, and the same request twice. Check the status and body each time, and that the second call does not repeat the effect.
- `read_console_messages` with `onlyErrors: true`: empty. No hydration mismatch, no React key warning.
- Logs show no security code and no `X-Api-Key`. Status links appear only because this is dev (CLAUDE.md Non-negotiables).

Stop the server when you are done with it, unless the user is using it.

### 9. UI changes: check it in the browser

Skip when nothing rendered changed. Otherwise, on the pages you touched:

- `read_page`: headings, landmarks and accessible names are right; the content is what the change should show.
- Drive it with `computer` / `form_input` as a user would: the happy path, then every state from step 2 (invalid input, error, empty, disabled, pending: click submit twice). Refresh mid-flow, go `back`, and open the page cold by its URL.
- `resize_window` with presets `mobile`, `tablet`, `desktop`, plus custom `320x568` (smallest phone) and `1920x1080` (large screen): no horizontal scroll, nothing clipped, overlapping or stranded in a wide empty page. Reset to `desktop` afterwards.
- Long content: put a long German word and a long error message where the page shows text. Nothing overflows or hides.
- Keyboard: Tab reaches every control in order, the focus ring is visible (never removed, never orange), Enter/Space activate. A failed submit focuses the first invalid field; a modal traps focus and returns it.
- New colours meet the contrast ratios in `docs/design-standard.md` §2.3, and tap targets meet its minimum. Compare against `user-interface-design`.
- After interacting, not only after load: `read_console_messages` with `onlyErrors: true` is empty, and `read_network_requests` shows no failed request, no browser call to the Zulex host, and no security code or key in any URL, request or response.
- Take a screenshot as proof for the report.

### 10. Boundary checks

Cheap greps for rules the tests don't fully cover:

```bash
grep -rnE "from ['\"](stripe|@stripe/|resend|@supabase/)" app src | grep -v "^src/adapters/" | grep -v "^app/(funnel)/_components/stripe/"   # vendor outside its adapter: must be empty; Stripe's browser SDK has that one folder, fenced by lint
grep -rn "NEXT_PUBLIC_" app src | grep -v NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY                  # only that one may be public
grep -rnE "from ['\"](@/src/adapters|@/app|\.\./\.\./adapters)" src/core                        # core depends on nothing outward
grep -rnE "^(export )?(let|var) |= new (Map|WeakMap)\(" app src | grep -v "\.test\." | grep -v "/fake/" | grep -v "^src/config/container.ts"   # module state is per Vercel instance (step 2, Instances)
```

All four print nothing. A hit is a layering bug or per-instance state (`project-structure`, `external-services`), not something to allowlist.

## Which steps to run

| Change | Steps |
|---|---|
| Docs, skills, markdown only | 1, and 2 for its last question: every fact checked against the code |
| Test only | 1-5 |
| Domain, use case, port, adapter, config | 1-5, 7, 8, 10 |
| Migration, seed, repository, persisted shape | 1-8, 10 |
| Route, page, component, styles | 1-5, 7-10 |
| Dependency, `next.config.ts`, env schema, CI | 1-10 |

When unsure, run all of it.

## Reporting

State what ran and how it ended, with numbers: "lint clean, typecheck clean, `<n>` suites / `<m>` tests pass with none skipped (Postgres included), build ok, canary absent, status and API routes dynamic, dev boot clean, 6 routes 200." Then the edges: "`<n>` worked out: `<a>` proven by tests (names), `<b>` checked by hand (which check), `<c>` to confirm on staging (what)." For a failure, quote the output and say whether you fixed it. Name every skipped step and why; Postgres suites that skipped are a skipped step.

The loop runs on fakes and stubbed networks in one process. It cannot prove live Zulex, Stripe or Resend behaviour beyond their test doubles, several Vercel instances at once, or the cron schedule. Say which of those the change touches and what to check on staging. Never say "should work": if a step didn't run or an edge has no proof, the change isn't verified.

## Red flags: stop and rerun

- You edited code after the last green run.
- You rely on an earlier session's or another agent's result.
- A test passed on the first run and you never saw it fail, or you added a guard and never broke the code to see it catch anything.
- Your edge list is only the happy path, or only edges you already handled while coding. Attack it instead: repeats, instances and dependency failure find what the author skips.
- The Postgres suites show as skipped in a change that touches persistence.
- You changed a fake without its real adapter, or the reverse, and did not rerun the port's contract.
- "It works in dev" offered as evidence about staging or production.
- You are about to write "verified" and have not read the output of each step.
