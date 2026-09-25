# ZulexGO

Consumer-facing (B2C) web app for German vehicle registration services, built on the
B2B Zulex API. The MVP covers one service: vehicle de-registration
(Außerbetriebsetzung), from eligibility check through payment to the official KBA
confirmation. There are no user accounts — order status is reached through a
one-time link sent by email.

## Getting started

```bash
npm ci
git config alias.start '!./scripts/git-start'
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No secrets are needed — `dev`
runs on in-memory fakes for every external service — but `APP_ENV` must be set:
the server validates its environment at start and refuses to run without it.

The middle line registers `git start`, which is how you begin a piece of work:

```bash
git start feature/eligibility-check
```

It fetches and branches off the current `origin/staging`, which is the only
correct base — see [CONTRIBUTING.md](CONTRIBUTING.md). The alias lives in your
local `.git/config`, so it is a one-off per clone and is not shared by git
itself; the script it calls, `scripts/git-start`, is checked in.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm test` | Jest (jsdom + node projects) |
| `npm run test:watch` | Jest in watch mode |
| `git start <branch>` | Branch off the current `origin/staging` (see Getting started) |

## Stages

Stage is selected by `APP_ENV` (`dev`, `staging`, `production`) — never `NODE_ENV`.
Local secrets go in `.env.local`, which is gitignored; `.env.example` is the
committed template. See the `environments` skill.

## Where things live

`app/` is routing only; `src/core/` is framework-free application logic; `src/adapters/`
implements the ports in `src/core/ports/`; `src/ui/` holds the design system and the
Shadcn primitives; `src/config/` is the composition root. The full tree and the
dependency rules between layers are in the `project-structure` skill.

All Zulex API calls are server-side only — the `X-Api-Key` is a merchant credential
and must never reach the browser.

## Documentation

| File | What it is |
|---|---|
| [CONTRIBUTING.md](CONTRIBUTING.md) | The branch workflow and the rules that enforce it. Read before your first pull request. |
| `CLAUDE.md` / `AGENTS.md` | The working rules, for people and for coding agents. |
| `docs/` | Authoritative product, design and launch specs. |
| `docs/provisioning.md` | The cloud resources, who owns them, and how each stage is wired. |
| `.claude/skills/` | The coding standards `CLAUDE.md` refers to by name. |

All of these are checked in — a fresh clone has everything.
