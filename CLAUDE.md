@AGENTS.md

# ZulexGO

## Project identity

ZulexGO is the consumer-facing (B2C) web app for German vehicle registration services, built on top of the existing B2B Zulex API. The MVP covers one service only — vehicle de-registration (Außerbetriebsetzung) — taking a private owner from eligibility check through payment to the official KBA confirmation. There are no user accounts: order status is reached through a one-time link sent by email.

## Stack

- **Next.js 16.3.5** (App Router, `app/`) · **React 19.2** · **TypeScript 5** · **Tailwind CSS v4** · **ESLint 9**
- Next.js 16 and Tailwind v4 both differ from most training data. Read `node_modules/next/dist/docs/` before writing framework code (see `AGENTS.md`), and configure Tailwind CSS-first via `@theme` in `app/globals.css` — there is no `tailwind.config.js`.
- **All Zulex API calls are server-side only.** The `X-Api-Key` is a merchant credential and must never reach the browser; the app talks to the API through its own route handlers/server actions.
- **No vendor is imported outside its own adapter.** External services — Stripe, the Zulex API, email, storage — sit behind ports in `src/core/ports/` and are wired in a single composition root. Stripe is the first payment adapter, not a dependency of the core; others will follow. See the `external-services` skill.
- Three stages — `dev`, `staging`, `production` — selected by `APP_ENV`, never `NODE_ENV`. Payments use manual capture (pre-authorization). No user accounts or auth in the MVP; status is reached by one-time link.
- Full product and integration constraints — status modelling, polling, idempotency, GDPR and German consumer-law obligations — are in `docs/prd.md`. Do not re-derive them here.
- **Shadcn** use Shadcn for all UI components. Create custom components only when needed. Otherwise create always from Shadcn. Use `gloabls.css` for unified and standarised css across the codebase.

## Branching

Two permanent branches, `staging` and `main`, both protected. **You cannot push to
either** — the rules apply to admins, so there is no override to look for. A push
to one fails with `GH006: protected branch hook declined`.

Work always starts from `staging`:

```bash
git start <branch-name>
```

That is a repo alias for `scripts/git-start`. Where it is not registered, the
equivalent is `git fetch origin && git switch --no-track -c <name> origin/staging`.
Never branch from `main`: it holds the last released code and its promotion merge
commits, both of which leak into `staging` when the branch merges back.

Open the pull request **into `staging`**, never into `main` — a required check,
`main accepts staging only`, fails any pull request into `main` whose source
branch is not `staging`. Promoting `staging` to `main` is a separate, deliberate
pull request.

The full flow and what enforces each rule are in `CONTRIBUTING.md`; the branch
protection settings and the one gap in them are in `docs/provisioning.md` §4.

## Design
Follow the design standards for this project using the user-interface-design skill at `.claude/skills/user-interface-design`. The UI design must be compatible on all devices including mobile devices, ipads, laptops and large screens.

## Testing

**Test what can silently break, not everything you write.** A test earns its place by protecting a rule, a behaviour, or a boundary — something a future change could break without anyone noticing. Tests that restate the source line above them cost maintenance and buy nothing; a suite full of them makes the real failures harder to see.

Write the test first where you are testing logic or a fix. Static presentation does not need a test at all.

### Tooling

- **Jest** is the test runner — no Vitest, no bespoke harnesses. Run it with `npm test` (CI: `npm test -- --ci`).
- Component and browser-side code runs on `jest-environment-jsdom`; route handlers, server actions, and the Zulex/Stripe clients run on `node`.
- Use established libraries rather than hand-rolling. Reach for the standard tool for the job:
  - **@testing-library/react** + **@testing-library/user-event** — React components, driven the way a user drives them (roles and labels, never class names or test IDs by default).
  - **@testing-library/jest-dom** — DOM matchers.
  - **msw** — intercept HTTP at the network boundary for Zulex API and Stripe; do not `jest.mock('fetch')` by hand.
  - **stripe-mock** (or MSW handlers modelled on real Stripe payloads) — payment flows; never call live Stripe in tests.
  - **zod** schemas (where they exist) as the single source of truth for fixture shape — fixtures must satisfy the same validation as production input.
  - Use any other testing library if you see fit.
- Keep tests deterministic: fake timers for polling/backoff, a frozen clock for anything date-dependent, seeded values for token generation. No real network, no real sleeps.

### Naming and location

- One test file per resource, named after the resource it covers: **`resource.test.ts`**, or `resource.test.tsx` when it renders React. `resource-name.test.js` is tolerated only where there is no TypeScript source — prefer `.ts`/`.tsx` in every new file.
- Unit tests sit **next to the file under test**: `app/lib/eligibility.ts` → `app/lib/eligibility.test.ts`.
- Integration tests live in **`tests/integration/`** and are named for the flow, not the file: `deregistration-checkout.test.ts`, `status-polling.test.ts`.
- Shared fixtures and MSW handlers go in `tests/fixtures/` and `tests/msw/`; never duplicate a Zulex payload inline across files.

### What to test

Test it when it is one of these:

- **Domain and business rules** — eligibility, pricing, status mapping, what is purchasable. Cover the happy path, every branch, the boundaries and the failure mode; these are the units where exhaustiveness pays.
- **Interactive behaviour** — anything a user drives: forms, validation, the funnel, disclosure, navigation panels.
- **Security and privacy invariants** — see Non-negotiables below.
- **Integration boundaries** — the Zulex API and Stripe clients, route handlers, server actions. Stub at the network layer.
- **Sources of non-determinism** — `Clock` and `TokenGenerator`, and anything else that would otherwise make a test sleep or guess. Both their adapters run the port's contract suite: the real one and the fake. The real ones are one-line wrappers, so it is tempting to skip them — don't. The fake is only trustworthy as a stand-in for production if the same suite passes against both, and every test that asserts on hold expiry, poll backoff or a status link is resting on that. See `external-services` § Non-determinism is a port.
- **Accessibility contracts that break invisibly** — accessible names, landmark and heading structure, keyboard operability.
- **Every bug you fix** — a failing test that reproduces it comes first, and it stays as the regression guard.

### What not to test

- **Static copy and markup.** That a heading contains the words you typed, that a card lists four services, that a paragraph exists.
- **Design tokens and class names.** Colour, spacing, radius, breakpoints. jsdom has no layout, so these assert the source, not the result. Check the design in a browser instead.
- **Presentational wrappers.** Layout components, section frames, decorative elements.
- **Content-model character limits.** Real constraints, but enforce them in review — as tests they fail on every copy edit without catching a defect.
- **Third-party primitives.** Base UI and shadcn are already tested. Test the way this app configures them, not that they work.

### What integration tests must cover

Core flows end to end across module boundaries, with the Zulex API and Stripe stubbed at the network layer.

### Non-negotiables

- **Security codes and status tokens must never appear in test output, snapshots, or fixtures committed as real values.** Assert that they are absent from logs and rendered status pages — that assertion is itself a required test.
- The `X-Api-Key` must never be reachable from a jsdom-environment test; a test that proves client bundles cannot see it is a feature test, not a nicety.
- Test behaviour, not implementation: assert on what the user or the caller observes. Avoid snapshot tests except for stable, reviewed output (e.g. generated email HTML), and never snapshot whole component trees.
- A bug fix starts with a failing test that reproduces it. Do not fix, then test.
- Never weaken or skip a test to make a build pass. If a test is wrong, fix the test deliberately and say so.
- A test that cannot fail is worse than no test. When you add a guard, prove it catches the thing it guards against before you keep it.
- Delete a test that no longer protects anything. Coverage is not the target — an untested presentational component is fine, an untested domain rule is not.

## Skills

Project skills live in `.claude/skills/`. Invoke them by name — they carry the full instructions, so this file does not repeat them.

| Skill | What it is | Use it when |
|---|---|---|
| `clean-code` | Pragmatic coding standards — concise and direct, no over-engineering, no unnecessary comments. | Writing or reviewing any code. Marked CRITICAL: treat it as this repo's default style. |
| `test-driven-development` | The test-first loop — write the test, watch it fail, write the minimum to pass. | Implementing logic or fixing a bug — i.e. the code the Testing section above says to test. Not for static presentation. |
| `cleaning-up-codebases` | Systematic cleanup that asks "should this exist?" before "how do I improve this?" — removal over refactoring. | Reviewing for dead code, cruft, scope creep, or architectural drift. |
| `project-structure` | The folder tree, the purpose of each folder, and the dependency rules between layers. | Creating a file, or deciding where code belongs. |
| `external-services` | Ports and adapters for every third party — domain-language interfaces, one folder per vendor, contract tests. | Integrating, calling, or replacing any outside service. |
| `database-migrations` | One folder per migration with up/down SQL, plus the idempotent dev-only seed. | Changing the schema, or adding mock data. |
| `environments` | What `dev`, `staging` and `production` are for, which adapters each wires up, and the guardrails between them. | Reading config, adding an env var, or choosing a base URL. |
| `user-interface-design` | design standards for ZulexGo visual identity | doing any UI work or creating React components |

## Supporting documents

Read these before making decisions in their area; they are authoritative and this file intentionally does not repeat them.

| Document | What it is | Read it when |
|---|---|---|
| [docs/prd.md](docs/prd.md) | Vision, personas, prioritised feature list, technical constraints, success criteria. | Starting any feature, or deciding whether something belongs in the MVP. |
| [docs/design-standard.md](docs/design-standard.md) | Full visual specification derived from the Zulex Style Guide — colour, type, spacing, the brand wedge, elevation, motion. | Making any visual decision, writing CSS, or adding a component. |
| [docs/site-contract.md](docs/site-contract.md) | Page structure, content inventory, and behaviour spec (navigation, scroll, hover, mobile, transitions). | Building or changing a page, or implementing interaction behaviour. |
| [docs/content-model.md](docs/content-model.md) | Every page section's content fields with length, format, and tone constraints. | Writing copy, defining props/schemas, or wiring content into a section. |
| [docs/launch-plan.md](docs/launch-plan.md) | Dependency-ordered milestones M0–M9 to production, with exit criteria, default technical decisions, and fallbacks for blocked items. | Deciding what to build next, or checking whether a milestone's exit criteria are met. |
