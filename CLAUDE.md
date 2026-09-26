@AGENTS.md

# ZulexGO

## Project identity

B2C web app for German vehicle registration services, built on the B2B Zulex API. MVP: one service, vehicle de-registration (Außerbetriebsetzung), from eligibility check through payment to the official KBA confirmation. No user accounts: order status is reached by a one-time link sent by email.

## Stack

- **Next.js 16.3.5** (App Router, `app/`) · **React 19.2** · **TypeScript 5** · **Tailwind CSS v4** · **ESLint 9**
- Next.js 16 and Tailwind v4 differ from most training data. Read `node_modules/next/dist/docs/` before writing framework code (see `AGENTS.md`). Tailwind is configured CSS-first via `@theme` in `app/globals.css`; there is no `tailwind.config.js`.
- **All Zulex API calls are server-side only.** The `X-Api-Key` is a merchant credential and must never reach the browser; the app calls the API through its own route handlers/server actions.
- **No vendor is imported outside its own adapter.** Stripe, the Zulex API, email, storage and identity verification (Verimi) sit behind ports in `src/core/ports/`, wired in one composition root. Stripe is the first payment adapter, not a core dependency. See the `external-services` skill.
- Stages `dev`, `staging`, `production`, selected by `APP_ENV`, never `NODE_ENV`.
- Cards use manual capture (pre-authorization); SEPA Direct Debit cannot be held and is captured at checkout.
- Business logic and integration constraints (the seven statuses, error algorithm, polling, idempotency, payment and refunds, GDPR and German consumer law) are in `docs/launch-plan.md`, which wins when documents disagree. Do not re-derive them here.
- **Shadcn** for all UI components; build a custom component only when Shadcn has none. Shared styling lives in `app/globals.css`.

## Branching

`staging` and `main` are both protected. **You cannot push to either**: the rules apply to admins, so there is no override. A push fails with `GH006: protected branch hook declined`.

Work always starts from `staging`:

```bash
git start <branch-name>
```

This is a repo alias for `scripts/git-start`. Where it is not registered: `git fetch origin && git switch --no-track -c <name> origin/staging`. Never branch from `main`: its released code and promotion merge commits leak into `staging` when the branch merges back.

Open pull requests **into `staging`**, never `main`. The required check `main accepts staging only` fails any pull request into `main` whose source is not `staging`. Promoting `staging` to `main` is a separate, deliberate pull request.

Full flow and enforcement: `CONTRIBUTING.md`. Branch protection settings and their one gap: `docs/provisioning.md` §4.

## Design

Follow the `user-interface-design` skill. Every UI must work on phones, tablets, laptops and large screens.

## Testing

**Test what can silently break, not everything you write.** A test earns its place by protecting a rule, a behaviour or a boundary that a future change could break unnoticed. Tests that restate the source cost maintenance and hide real failures.

Write the test first for logic and fixes. Static presentation needs no test.

### Tooling

- **Jest** only (no Vitest, no bespoke harnesses): `npm test`, CI `npm test -- --ci`.
- The extension picks the environment: `*.test.tsx` → `jest-environment-jsdom` (components, browser code); `*.test.ts` → `node` (route handlers, server actions, Zulex/Stripe clients, pure functions).
- Use established libraries, not hand-rolled helpers. Others are fine where they fit.
  - **@testing-library/react** + **@testing-library/user-event**: drive components as a user does, by role and label, not class names or test IDs by default.
  - **@testing-library/jest-dom**: DOM matchers.
  - **msw**: intercept Zulex and Stripe HTTP at the network boundary; never `jest.mock('fetch')` by hand.
  - **stripe-mock**, or MSW handlers modelled on real Stripe payloads, for payment flows; never call live Stripe.
  - **zod** schemas, where they exist, define fixture shape: fixtures pass the same validation as production input.
- Deterministic: fake timers for polling/backoff, a frozen clock for dates, seeded token generation. No real network, no real sleeps.

### Naming and location

- One test file per resource: **`resource.test.ts`**, or `.test.tsx` when it renders React. Jest matches nothing else; a `.test.js` never runs.
- Unit tests sit **next to the file under test**: `src/core/domain/eligibility.ts` → `src/core/domain/eligibility.test.ts`.
- Integration tests live in **`tests/integration/`**, named for the flow: `deregistration-checkout.test.ts`, `status-polling.test.ts`.
- Shared fixtures in `tests/fixtures/`, MSW handlers in `tests/msw/`; never duplicate a Zulex payload inline across files.

### What to test

- **Domain and business rules**: eligibility, pricing, status mapping, what is purchasable. Cover the happy path, every branch, the boundaries and the failure mode.
- **Interactive behaviour**: forms, validation, the funnel, disclosure, navigation panels.
- **Security and privacy invariants**: see Non-negotiables.
- **Integration boundaries**: Zulex and Stripe clients, route handlers, server actions, stubbed at the network layer.
- **Sources of non-determinism**: `Clock`, `TokenGenerator`, anything that would make a test sleep or guess. The real and fake adapters both run the port's contract suite. Don't skip the real one-line wrappers: the fake is only a trustworthy stand-in if the same suite passes against both, and every test on hold expiry, poll backoff or status links rests on that. See `external-services` § Non-determinism is a port.
- **Accessibility contracts that break invisibly**: accessible names, landmark and heading structure, keyboard operability.
- **Every bug you fix**: a failing reproduction test comes first and stays as the regression guard.

### What not to test

- **Static copy and markup**: heading text, that a card lists four services, that a paragraph exists.
- **Design tokens and class names**: colour, spacing, radius, breakpoints. jsdom has no layout, so these assert the source; check the design in a browser. Exception: class *merging* (`cn` picking which conflicting class survives) is logic and is tested.
- **Presentational wrappers**: layout components, section frames, decorative elements.
- **Content-model character limits**: enforce in review; as tests they break on every copy edit and catch no defect.
- **Third-party primitives**: Base UI and shadcn are already tested. Test how this app configures them.

### What integration tests must cover

Core flows end to end across module boundaries, with Zulex and Stripe stubbed at the network layer.

### Non-negotiables

- **Security codes and status tokens never appear in test output, snapshots, or fixtures committed as real values.** Asserting their absence from logs and rendered status pages is itself a required test.
- The `X-Api-Key` must never be reachable from a jsdom-environment test; a test proving client bundles cannot see it is a feature test.
- Test behaviour, not implementation: assert what the user or caller observes. Snapshots only for stable, reviewed output (e.g. generated email HTML); never whole component trees.
- A bug fix starts with a failing test that reproduces it. Never fix, then test.
- Never weaken or skip a test to make a build pass. If a test is wrong, fix it deliberately and say so.
- A test that cannot fail is worse than none. Prove a new guard catches what it guards against before keeping it.
- Delete tests that no longer protect anything. Coverage is not the target: an untested presentational component is fine, an untested domain rule is not.

## Skills

In `.claude/skills/`; invoke by name. They carry the full instructions.

| Skill | What it is | Use it when |
|---|---|---|
| `clean-code` | Pragmatic standards: concise, no over-engineering, no unnecessary comments. **CRITICAL: the repo's default style.** | Writing or reviewing any code. |
| `test-driven-development` | Test-first loop: write the test, watch it fail, write the minimum to pass. | Implementing logic or fixing a bug (what Testing says to test). Not static presentation. |
| `cleaning-up-codebases` | Cleanup that asks "should this exist?" first; removal over refactoring. | Reviewing for dead code, cruft, scope creep, architectural drift. |
| `project-structure` | Folder tree, folder purposes, dependency rules between layers. | Creating a file or deciding where code belongs. |
| `external-services` | Ports and adapters for every third party: domain-language interfaces, one folder per vendor, contract tests. | Integrating, calling or replacing an outside service. |
| `database-migrations` | One folder per migration with up/down SQL, plus the idempotent dev-only seed. | Changing the schema or adding mock data. |
| `environments` | What each stage is for, which adapters it wires, guardrails between them. | Reading config, adding an env var, choosing a base URL. |
| `user-interface-design` | ZulexGO visual identity standards. | Any UI work or React component. |

## Supporting documents

Authoritative; read before deciding in their area. This file does not repeat them.

| Document | What it is | Read it when |
|---|---|---|
| [docs/prd.md](docs/prd.md) | Vision, personas, prioritised features, success criteria, with pointers to where each rule lives. | Starting a feature, or deciding if something is MVP. |
| [docs/design-standard.md](docs/design-standard.md) | Visual spec from the Zulex Style Guide: colour, type, spacing, brand wedge, elevation, motion. | Any visual decision, CSS or new component. |
| [docs/site-contract.md](docs/site-contract.md) | Page structure, content fields with length/format/tone limits, behaviour spec (navigation, scroll, hover, mobile, transitions). | Building a page, writing copy, defining props/schemas, implementing interaction. |
| [docs/launch-plan.md](docs/launch-plan.md) | Milestones M0–M9 with exit criteria, default technical decisions, fallbacks for blocked items, open questions Q1–Q18. **Source of truth when documents disagree.** | Choosing what to build next, checking exit criteria, implementing any status, error, payment or refund rule. |
| [docs/deregistration-user-journeys.md](docs/deregistration-user-journeys.md) | Success, failure and edge-case journeys J1–J12, plus problems found in the Zulex API spec. | Handling a failure path or edge case. |
| [docs/domain-glossary.md](docs/domain-glossary.md) | German registration and payment terms: KBA, Teil I, Sicherheitscode, Verimi, processing fee, pre-authorization. | Meeting an unknown domain term, or naming something in code. |
