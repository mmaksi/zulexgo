import { TOKEN_MIN_LENGTH, type TokenGenerator } from "@/src/core/ports/token-generator"

/** Makes a fake token unmistakable wherever it surfaces, in output or in a link. */
const PREFIX = "faketoken"
/** Padding must not be a digit, or a wider counter would collide with a padded narrower one. */
const PADDING = "x"

/**
 * Predictable by design: a test asserts on the token it expects, never on chance.
 * Hands out `faketoken-000001`, `faketoken-000002`, … padded to `TOKEN_MIN_LENGTH` so it
 * meets the same URL-safe, long-enough contract as the real generator. The counter is per
 * instance, so two fresh instances issue the same sequence and uniqueness holds within one.
 * Injected by tests directly; the container never wires it.
 */
export class FakeTokenGenerator implements TokenGenerator {
  private issued = 0

  generate(): string {
    this.issued += 1
    return `${PREFIX}-${String(this.issued).padStart(6, "0")}`.padEnd(TOKEN_MIN_LENGTH, PADDING)
  }
}
