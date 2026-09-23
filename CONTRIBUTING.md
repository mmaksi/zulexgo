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

1. Branch off `staging`. Any name; `feature/…`, `fix/…` and `chore/…` read well.
2. Push it and open a pull request **into `staging`**. CI runs. Merge it when
   green — no approval needed at this step.
3. When staging has been exercised and looks right, open a pull request
   **`staging` → `main`**. CI runs again, and this one needs an approving review
   before it can merge.
4. Merging to `main` deploys production.

## Rules, and what enforces them

These are GitHub branch protection rules, not etiquette. They fail loudly.

| Rule | Enforced by |
|---|---|
| No direct push to `main` or `staging` | Branch protection: a pull request is required on both |
| Nothing merges without CI green | Branch protection: `lint, typecheck, test, build` is a required check |
| A feature branch may not merge into `main` | The `main accepts staging only` check, required on `main`, fails any pull request whose source is not `staging` |
| `main` needs review | Branch protection: one approving review required |
| No force-push, no deletion of `main` or `staging` | Branch protection |

If you find yourself wanting to bypass one of these, change the rule in the open
rather than working around it — a guardrail that people route around is worse
than none, because it still gets trusted.

## Before you open the pull request

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

That is exactly what CI runs. Running it locally first saves a round trip.
