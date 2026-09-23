import { TOKEN_MIN_LENGTH, type TokenGenerator } from "@/src/core/ports/token-generator"

const PREFIX = "faketoken"
/** Padding must not be a digit, or a wider counter would collide with a padded narrower one. */
const PADDING = "x"

/** Predictable by design: a test asserts on the token it expects, never on chance. */
export class FakeTokenGenerator implements TokenGenerator {
  private issued = 0

  generate(): string {
    this.issued += 1
    return `${PREFIX}-${String(this.issued).padStart(6, "0")}`.padEnd(TOKEN_MIN_LENGTH, PADDING)
  }
}
