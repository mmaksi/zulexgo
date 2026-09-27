---
name: verify-app
description: Use before claiming any change is done, before committing, and before opening a pull request - runs the verification loop (diff scope, lint, typecheck, tests, CI-equivalent build with the secret canary, clean dev-server boot, browser check for UI) and reports what passed, failed or was skipped
---

# Verify the app

## Overview

"Done" means the loop below ran green on the final state of the code, not an earlier one. Run it fast to slow; the first failure stops the loop. Fix it, rerun that step, then rerun the whole loop once before reporting, because a fix can break an earlier step.

The loop mirrors CI (`.github/workflows/ci.yml`): if it passes here, the `lint, typecheck, test, build` check passes there. Whole loop takes under a minute.

## The loop

### 1. Scope: is the diff what you meant?

```bash
git status --short && git diff --stat
```

Only files the task needed. No stray debug output, `console.log`, `.only`, `.skip`, commented-out code, or `.env*` changes. A changed `AGENTS.md` is the block `next dev` re-adds (see that file); leave it alone.

### 2. Lint

```bash
npm run lint
```

Zero errors and zero warnings. Never add an `eslint-disable` to get past it; fix the code.

### 3. Typecheck

```bash
npm run typecheck
```

Runs `next typegen` first, so route types match the `app/` tree. Never silence an error with `any`, `as` or `@ts-expect-error`.

### 4. Tests

```bash
npm test -- --ci
```

All suites pass in both projects (`jsdom` and `node`). While iterating, run one file: `npx jest path/to/file.test.ts`, but finish on the full suite.

- New logic or a fix has a test, and you watched it fail before the code made it pass (`test-driven-development`). A test you never saw fail proves nothing.
- The suite count did not drop, and no test was skipped, deleted or loosened to go green. If a test was wrong, say so and why.

### 5. Production build, CI configuration

```bash
APP_ENV=staging APP_BASE_URL=https://ci.example.test CRON_SECRET=ci-placeholder-cron-secret \
PAYMENT_DRIVER=fake REGISTRATION_DRIVER=fake MAIL_DRIVER=console REPOSITORY_DRIVER=fake STORAGE_DRIVER=fake \
ZULEX_API_KEY=ci-canary-zulex-api-key-must-not-ship npm run build \
&& ! grep -rqF ci-canary-zulex-api-key-must-not-ship .next/static && echo "canary absent from client chunks"
```

The same env as CI. Shell variables override `.env.local`, so the build proves the staging configuration parses, not your local one. It catches what the dev server forgives: `server-only` imports reaching a client component, prerender errors, and a server secret leaking into `.next/static`. A canary hit is a security failure, not a flaky step. `next build` writes to `.next`, `next dev` to `.next/dev`, so it can run beside a dev server.

### 6. Dev server boots clean

Start it with the preview tool, never `npm run dev` in Bash:

```
preview_start { name: "zulexgo-dev" }
```

If one is already running (`.next/dev/lock` holds its PID and URL), reuse it. Then:

- `preview_logs`: `✓ Ready`, and no error, warning, or stack trace. `instrumentation.ts` builds the container at boot, so a clean start proves the dev env parses.
- Every route answers, and an unknown one 404s:
  ```bash
  for p in / /agb /datenschutz /impressum /does-not-exist; do echo "$(curl -s -o /dev/null -w '%{http_code}' localhost:3000$p) $p"; done
  ```
  Add any route your change created.
- `read_console_messages` with `onlyErrors: true`: empty. No hydration mismatch, no React key warning.
- Logs show no security code or `X-Api-Key`, and no status token outside dev (CLAUDE.md Non-negotiables).

Stop the server when you are done with it, unless the user is using it.

### 7. UI changes: check it in the browser

Skip when nothing rendered changed. Otherwise, on the pages you touched:

- `read_page`: headings, landmarks and accessible names are right; the content is what the change should show.
- Drive the interaction with `computer` / `form_input` as a user would, including the failure path (invalid input, error state).
- `resize_window` with presets `mobile`, `tablet`, `desktop`: no horizontal scroll, nothing clipped or overlapping. Reset to `desktop` afterwards.
- Keyboard: Tab reaches every control in order, focus is visible, Enter/Space activate.
- Compare against `user-interface-design` and `docs/design-standard.md`.
- Take a screenshot as proof for the report.

### 8. Boundary checks

Cheap greps for rules the tests don't fully cover:

```bash
grep -rnE "from ['\"](stripe|@stripe/|resend|@supabase/)" app src | grep -v "^src/adapters/"   # vendor outside its adapter: must be empty
grep -rn "NEXT_PUBLIC_" app src | grep -v NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY                  # only that one may be public
grep -rnE "from ['\"](@/src/adapters|@/app|\.\./\.\./adapters)" src/core                        # core depends on nothing outward
```

All three print nothing. A hit is a layering bug (`project-structure`, `external-services`), not something to allowlist.

## Which steps to run

| Change | Steps |
|---|---|
| Docs, skills, markdown only | 1 |
| Test only | 1–4 |
| Domain, use case, port, adapter, config | 1–6, 8 |
| Route, page, component, styles | 1–8 |
| Dependency, `next.config.ts`, env schema, CI | 1–8 |

When unsure, run all of it.

## Reporting

State what ran and how it ended, with numbers: "lint clean, typecheck clean, 38 suites / 313 tests pass, build ok, canary absent, dev boot clean, 5 routes 200." For a failure, quote the output and say whether you fixed it. Name every skipped step and why. Never say "should work": if a step didn't run, the change isn't verified.

## Red flags: stop and rerun

- You edited code after the last green run.
- You rely on an earlier session's or another agent's result.
- A test passed on the first run and you never saw it fail.
- You are about to write "verified" and have not read the output of each step.
