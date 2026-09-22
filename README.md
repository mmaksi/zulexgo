# ZulexGO

Consumer-facing (B2C) web app for German vehicle registration services, built on the
B2B Zulex API. The MVP covers one service: vehicle de-registration
(Außerbetriebsetzung), from eligibility check through payment to the official KBA
confirmation. There are no user accounts — order status is reached through a
one-time link sent by email.

## Getting started

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Jest (jsdom + node projects) |
| `npm run test:watch` | Jest in watch mode |

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

`CLAUDE.md` carries the working rules. The authoritative product and design specs
(`docs/`) and the coding-standard skills (`.claude/`) are **deliberately not
checked in** — they live alongside the repo, not in it. `CLAUDE.md` and
`AGENTS.md` reference them by path, so get a copy from the team before relying on
those links.
