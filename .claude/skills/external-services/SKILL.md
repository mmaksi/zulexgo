---
name: external-services
description: Use when integrating, replacing, or calling any third-party service (payment, registration API, email, storage, SMS, identity) - keep vendors behind ports so they can be swapped without touching core logic
---

# External Services — Ports and Adapters

## Overview

No third-party vendor is allowed to become a dependency of this application's core. Stripe is *a* payment provider, not *the* payment provider. The Zulex API is *a* registration gateway. Both will change.

**Core principle:** the core defines the interface it needs in its own language; vendors implement it. Dependencies point inward, never outward.

```
core/use-cases  →  core/ports (interface)  ←  adapters/payment/stripe (implementation)
```

If swapping a vendor requires editing a file outside `src/adapters/` and one line in the composition root, the abstraction is wrong.

## The four rules

1. **A vendor SDK may be imported in exactly one folder.** `import Stripe from 'stripe'` is legal only inside `src/adapters/payment/stripe/`. Anywhere else it is a bug, enforced by lint (see below).
2. **Ports speak domain language, not vendor language.** `PaymentProvider.authorize()`, not `createPaymentIntent()`. `RegistrationGateway.submitDeregistration()`, not `postDeregistrationApplication()`. If a port method name would change when you swap vendors, rename it.
3. **Vendor types never cross the boundary.** No `Stripe.PaymentIntent` in a function signature outside the adapter. The adapter maps vendor shapes to domain types at its edge and throws domain errors, not SDK errors.
4. **Every port ships with at least two adapters:** the real one and an in-memory fake used by tests and by dev mode. A port with one implementation has not been proven swappable.

## Defining a port

Ports live in `src/core/ports/`, one file per capability. They are pure TypeScript — no imports from `adapters/`, `app/`, or any SDK.

```ts
// src/core/ports/payment-provider.ts
export interface PaymentProvider {
  /** Reserve funds without capturing. Returns our own reference, not the vendor's. */
  authorize(input: AuthorizeInput): Promise<Authorization>;
  /** Take the reserved funds. Idempotent on authorizationId. */
  capture(authorizationId: AuthorizationId): Promise<Capture>;
  /** Release an uncaptured hold. Safe to call twice. */
  release(authorizationId: AuthorizationId): Promise<void>;
  refund(captureId: CaptureId, amount: Money): Promise<Refund>;
}
```

Document the *semantics* the core relies on (idempotency, retry safety, whether a hold expires) in the port, because those are the guarantees every adapter must honour.

## Writing an adapter

One folder per vendor: `src/adapters/<capability>/<vendor>/`.

```
src/adapters/payment/
  stripe/
    stripe-payment-provider.ts     # implements PaymentProvider
    stripe-payment-provider.test.ts
    map.ts                         # vendor shape → domain type, and back
    errors.ts                      # vendor error → domain error
  fake/
    fake-payment-provider.ts       # in-memory; used in dev + tests
```

The adapter owns: SDK construction, auth/credentials, retries and backoff, vendor error translation, and mapping. It owns nothing about business rules — an adapter must never decide *whether* to capture a payment, only *how*.

## Contract tests — the part that makes this real

Each port has one shared test suite that every adapter must pass. This is what guarantees the fake behaves like the real thing, and what makes the next vendor cheap.

```ts
// src/core/ports/payment-provider.contract.ts
export function paymentProviderContract(name: string, makeSubject: () => PaymentProvider) {
  describe(`PaymentProvider contract: ${name}`, () => {
    it('release() after release() does not throw', async () => { /* ... */ });
    it('capture() twice captures once', async () => { /* ... */ });
    // ...every guarantee the port documents
  });
}
```

Both `stripe-payment-provider.test.ts` and `fake-payment-provider.test.ts` call it. The Stripe run is driven through MSW or stripe-mock — never live Stripe. When you add a vendor, you write its adapter and call the existing contract; if it passes, the core already works with it.

## Wiring — the composition root

Adapters are selected in exactly one place, `src/config/container.ts`, based on environment (see the `environments` skill). Nothing else constructs an adapter.

```ts
// src/config/container.ts
export function createContainer(source: EnvSource = process.env): Container {
  const env = parseEnv(source)
  return {
    env,
    payments: env.PAYMENT_DRIVER === "stripe"
      ? new StripePaymentProvider(env.STRIPE_SECRET_KEY)
      : new FakePaymentProvider(),
    registration: /* ... */,
    mailer: /* ... */,
    clock: new SystemClock(),
    tokens: new CryptoTokenGenerator(),
  }
}
```

Use cases receive their ports as constructor arguments or function parameters. They never reach for a global, never import the container, and are therefore trivially testable with fakes.

## Ports this project needs

| Port | Real adapter | Notes |
|---|---|---|
| `PaymentProvider` | Stripe (manual capture for cards; SEPA Direct Debit captured at checkout) | Hold expiry is a documented port guarantee; partial refunds for the 19.99 € processing fee |
| `RegistrationGateway` | Zulex API | Also the KBA status source; see `docs/launch-plan.md` |
| `Mailer` | Resend | The eight status and refund emails, one-time link delivery |
| `ApplicationRepository` | Postgres | Owns our status machine, not the vendor's |
| `DocumentStore` | Zulex `/documents/{id}` + Supabase Storage cache | Returns bytes + a domain document type |
| `IdentityVerification` | Verimi — integration route pending (launch plan Q1–Q3) | Status 2 → 3; a failed verification leads to 5c |
| `Clock` | System clock | Injected so polling/expiry tests are deterministic |
| `TokenGenerator` | Crypto RNG | Injected so one-time link tests are seeded |

## Non-determinism is a port

`Clock` and `TokenGenerator` are ports for the same reason as Stripe: they are sources of non-determinism the core should not reach for directly.

The core never calls `new Date()` or `randomBytes()` itself. Three small classes exist so it does not have to:

| Class | What it is | Why it exists |
|---|---|---|
| `SystemClock` | `now()` returns `new Date()` | The one place in the app allowed to read the wall clock. |
| `FakeClock` | Stands still until `advance(ms)` or `set(date)` moves it | Lets a test cross a deadline in a line instead of sleeping. |
| `CryptoTokenGenerator` | 32 random bytes, base64url | The one place allowed to read the CSPRNG. One-time status links have no other protection. |
| `FakeTokenGenerator` | A seeded counter, prefixed `faketoken-` | Lets a test assert the exact link it expects, and makes a fake token unmistakable in output. |

This is not ceremony. A Stripe pre-authorisation hold expires after roughly seven days and the status poller backs off over 1, 2, 5, 10, 30 minutes then hourly. Testing "the hold expired before capture" against the real clock means sleeping for a week or never testing it; against `FakeClock` it is `clock.advance(SEVEN_DAYS)`. The price is that use cases take the clock as an argument rather than calling `new Date()` — that is the whole trade, and it is why the lint rules treat a direct `new Date()` in `src/core/` as drift.

**Both adapters must pass the port's contract suite — the real one included.** `SystemClock` and `CryptoTokenGenerator` are one-liners, which makes skipping their tests tempting. The point is not that a one-liner might be wrong. It is that the fake is only a valid stand-in for production if the same guarantees hold on both sides, and every assertion about expiry, backoff or a status link rests on that equivalence. A contract that has only ever run against the fake proves nothing about the deployed app.

**These ports carry no driver variable.** Unlike `PaymentProvider` or `RegistrationGateway`, they are real in every stage including dev: there is no network, no money and no secret to fake away, and a frozen clock or a predictable status link in a running dev server is a bug, not a convenience. Their fakes are injected directly by tests, which is what rule 4 asks for. Wiring is in `src/config/container.ts`, with the reasoning recorded there.

## Enforcement

Add to `eslint.config.mjs` — a rule beats a convention:

```js
{
  files: ["src/core/**/*.ts", "app/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": ["error", {
      paths: [
        { name: "stripe", message: "Import the PaymentProvider port; Stripe lives in src/adapters/payment/stripe/." },
      ],
      patterns: [
        { group: ["@/src/adapters/*"], message: "Depend on a port from src/core/ports/, not on a concrete adapter." },
      ],
    }],
  },
}
```

Extend `paths` for every SDK you add. When a new vendor arrives, the lint rule is part of the change.

`src/core/` additionally carries a `no-restricted-syntax` block for the non-determinism ports — a zero-argument `new Date()`, `Date.now()` and `Math.random()` are errors there. `new Date(value)` to parse a stored instant is untouched; it is reaching for *the current* time that is banned.

## Checklist for adding a service

1. Write the port in `src/core/ports/` in domain language, documenting its guarantees.
2. Write the contract test suite for those guarantees.
3. Write the in-memory fake; make it pass the contract.
4. Write the real adapter; make it pass the same contract with the network stubbed.
5. Wire it in `src/config/container.ts` and add the env vars (see `environments`).
6. Add the SDK to the `no-restricted-imports` list.
7. Only now use it from a use case.
