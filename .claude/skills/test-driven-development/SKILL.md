---
name: test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code - write the test first, watch it fail, write minimal code to pass; ensures tests actually verify behavior by requiring failure first
---

# Test-Driven Development

**Core principle:** if you didn't watch the test fail, you don't know if it tests the right thing. Violating the letter of these rules is violating the spirit.

## When to use

For everything `CLAUDE.md` § Testing says to test (bug fixes included), and never for what it excludes. Configuration files are excluded too. Throwaway prototypes and generated code are the only exceptions, and only with your human partner's permission. Thinking "skip TDD just this once"? That's rationalization.

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Wrote code before the test? Delete it and implement fresh from tests. Don't keep it as "reference", don't "adapt" it while writing tests, don't look at it. Delete means delete. Need to explore first? Fine — throw the exploration away, then start with TDD.

## Red-Green-Refactor

1. **RED — write one minimal failing test.** One behavior (an "and" in the name means split it), a name that describes the behavior (not `test1`), an assertion that shows the desired API, real code (mocks only if unavoidable).

   ```typescript
   // Good: clear name, real behavior, one thing
   test('retries failed operations 3 times', async () => {
     let attempts = 0;
     const result = await retryOperation(async () => {
       if (++attempts < 3) throw new Error('fail');
       return 'success';
     });
     expect(result).toBe('success');
     expect(attempts).toBe(3);
   });
   // Bad: test('retry works') asserting only mock.toHaveBeenCalledTimes(3) — vague, tests the mock
   ```

2. **Verify RED — mandatory, never skip.** Run `npm test path/to/file.test.ts` and confirm it *fails* (not errors), with the expected message, because the feature is missing (not a typo). Passes? You're testing existing behavior — fix the test. Errors? Fix the error and re-run until it fails correctly. Can't explain why it failed? Start over.

3. **GREEN — simplest code that passes.** No options, features, refactors of other code or "improvements" beyond the test (e.g. no `maxRetries`/`backoff`/`onRetry` options when the test only needs three tries — YAGNI).

4. **Verify GREEN — mandatory.** The test passes, all other tests still pass, output is pristine (no errors or warnings). Test fails? Fix the code, not the test. Other tests fail? Fix them now.

5. **REFACTOR — after green only.** Remove duplication, improve names, extract helpers. Stay green; add no behavior.

6. **Repeat** with the next failing test for the next behavior.

**Bug fixes:** write a failing test that reproduces the bug (e.g. `rejects empty email` fails with `expected 'Email required', got undefined`), then run the cycle. The test proves the fix and guards against regression. Never fix a bug without one.

## Before claiming work complete

- [ ] Every new function/method has a test
- [ ] Watched each test fail, for the expected reason, before implementing
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass; output pristine
- [ ] Tests use real code (mocks only if unavoidable)
- [ ] Edge cases and errors covered

Testing is part of implementation, not a follow-up: "implementation complete, ready for testing" is not complete. Can't tick every box? You skipped TDD — start over.

## Rationalizations — all mean: delete the code, start over with TDD

| Excuse | Reality |
|---|---|
| "Too simple to test" | Simple code breaks. The test takes 30 seconds. |
| "I'll test after" / "tests added later" | Tests written after pass immediately, which proves nothing: they may test the wrong thing or the implementation, miss forgotten edge cases, and you never saw them catch the bug. |
| "Tests after achieve the same goals — it's spirit, not ritual" | Tests-after answer "what does this do?", biased by what you built; tests-first answer "what should this do?" and force edge-case discovery before implementing. You get coverage but lose proof the tests work. |
| "I already manually tested it" / "manual is faster" | Ad-hoc: no record, can't re-run on change, easy to forget cases under pressure, and you'll re-test every change. |
| "Deleting X hours of work is wasteful" | Sunk cost. Keeping code you can't trust is the waste — working code without real tests is technical debt. |
| "Keep it as reference" / "adapt existing code" | You'll adapt it. That's testing after. |
| "TDD is dogmatic, I'm being pragmatic" | TDD is the pragmatic path: bugs found before commit, regressions caught, behavior documented, refactoring safe. Shortcuts mean debugging in production. |
| "Existing code has no tests" | You're improving it — add tests for the existing code. |
| "This is different because…" / "just this once" | It isn't. |

## When stuck

| Problem | Solution |
|---|---|
| Don't know how to test | Write the wished-for API; write the assertion first; ask your human partner. |
| Test too complicated / hard to test | The design is too complicated — hard to test means hard to use. Simplify the interface. |
| Must mock everything | Code too coupled — use dependency injection. |
| Test setup huge | Extract helpers; still complex, simplify the design. |

## Mocks: test real behavior, not the mock

Mocks isolate; they are never the thing under test. If you're testing mock behavior, you added mocks without first watching the test fail against real code.

1. **Never assert on mock behavior.** `expect(screen.getByTestId('sidebar-mock'))` proves the mock exists, nothing more. Render the real component and assert on it (`getByRole('navigation')`), or, if it must be mocked for isolation, assert on the parent's behavior, not the mock. Before any assertion on a mocked element ask "real behavior or mock existence?" — if the latter, delete the assertion or unmock.

2. **Never add test-only methods to production code.** A `destroy()` only tests call pollutes the class, is dangerous if called in production, and confuses object lifecycle with entity lifecycle. Put cleanup in test utilities (`cleanupSession(session)`). Before adding a method ask "only used by tests?" (then don't) and "does this class own this resource's lifecycle?" (if not, wrong class).

3. **Never mock without understanding the dependency.** Before mocking, ask what side effects the real method has, whether the test depends on them, and whether you fully understand what the test needs. If it depends on them, mock at a lower level (the actual slow/external operation) or use a double that preserves the needed behavior — not the high-level method. If unsure, run with the real implementation first, observe, then add minimal mocking at the right level.

   ```typescript
   // Bad: jest.mock('./tool-catalog') stubs the config write the test depends on,
   // so the second addServer never throws. Good: mock only the slow startup.
   jest.mock('./mcp-server-manager');

   test('detects duplicate server', async () => {
     await addServer(config);
     await expect(addServer(config)).rejects.toThrow(/already exists/);
   });
   ```

4. **Mock the complete data structure** as the real API returns it, not just the fields this test reads — partial mocks hide structural assumptions and pass while integration fails (e.g. downstream reads `response.metadata.requestId` you left out). Take the shape from the real docs/examples, include every field the system may consume, and when unsure include all documented fields.

5. **Complex mocks are a signal.** Mock setup longer than the test logic (>50%), mocking everything to make it pass, mocks missing methods the real thing has, tests that break when the mock changes or fail when you remove it, a mock you can't justify, mocking "to be safe" or because "it might be slow" — ask "do we need a mock here?" An integration test with real components is often simpler.
