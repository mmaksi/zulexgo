# Contributing

## Branches

Two branches are permanent. Everything else is temporary and gets deleted after
it merges.

```
feature/*  →  staging  →  main
              (staging   (production
               deploy)    deploy)
```

- **`main`** is production. Vercel deploys it.
- **`staging`** is the rehearsal. Vercel deploys it to the staging URL.
- **Everything else** is a short-lived branch off `staging`.

## The flow

1. Branch off `staging`:

   ```bash
   git start feature/eligibility-check
   ```

   `git start` fetches, then creates the branch from the current
   `origin/staging` with no upstream set. Any name works; `feature/…`, `fix/…`
   and `chore/…` read well. If the alias is not registered yet:

   ```bash
   git config alias.start '!./scripts/git-start'
   ```

   The equivalent by hand is
   `git fetch origin && git switch --no-track -c <name> origin/staging`.

2. `git push -u origin HEAD` and open a pull request **into `staging`**. CI runs.
   Merge it when green — no approval needed at this step.
3. When staging has been exercised and looks right, open a pull request
   **`staging` → `main`**. CI runs again, and the `main accepts staging only`
   check confirms the source. Merge it.
4. Merging to `main` deploys production.

## Rules, and what enforces them

These are GitHub branch protection rules, not etiquette. They fail loudly.

| Rule | Enforced by |
|---|---|
| No direct push to `main` or `staging` | Branch protection: a pull request is required on both, and the rules apply to admins too — verified by a rejected push |
| Nothing merges without CI green | Branch protection: `lint, typecheck, test, build` is a required check |
| A feature branch may not merge into `main` | The `main accepts staging only` check, required on `main`, fails any pull request whose source is not `staging` |
| No force-push, no deletion of `main` or `staging` | Branch protection |

If you find yourself wanting to bypass one of these, change the rule in the open
rather than working around it — a guardrail that people route around is worse
than none, because it still gets trusted.

## Why `staging` and never `main`

Today the two branches hold identical content, so a branch cut from `main` would
appear to work. It breaks as soon as `staging` is ahead of `main`, which is its
normal state between promotions:

- you would be building on the **last released** code, and your pull request
  would conflict with everything merged since — which the required
  "branch is up to date" rule then makes you resolve anyway, later;
- your branch would carry `main`'s promotion merge commits, so merging it into
  `staging` writes *"Merge pull request from staging"* into staging's own
  history, permanently.

`git start` removes the choice, which is the point of it.

## Before you open the pull request

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

That is exactly what CI runs. Running it locally first saves a round trip.
