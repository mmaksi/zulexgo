import { TOKEN_MIN_LENGTH, TOKEN_PATTERN, type TokenGenerator } from "./token-generator"

// Enough to catch a counter that resets or a short random space; it cannot prove real entropy.
const SAMPLE_SIZE = 1000

/**
 * Every TokenGenerator adapter must pass this, including the fake.
 *
 * Pins down the port's guarantees: tokens match `TOKEN_PATTERN` (URL-safe),
 * are at least `TOKEN_MIN_LENGTH` long, and do not repeat within one generator.
 * The 256 bits of entropy of the real adapter rest on its use of random bytes,
 * not on this suite.
 */
export function tokenGeneratorContract(name: string, makeSubject: () => TokenGenerator) {
  describe(`TokenGenerator contract: ${name}`, () => {
    it("generates URL-safe tokens", () => {
      expect(makeSubject().generate()).toMatch(TOKEN_PATTERN)
    })

    it("generates tokens long enough to be unguessable", () => {
      expect(makeSubject().generate().length).toBeGreaterThanOrEqual(TOKEN_MIN_LENGTH)
    })

    it("never repeats a token", () => {
      const subject = makeSubject()
      const tokens = new Set(Array.from({ length: SAMPLE_SIZE }, () => subject.generate()))

      expect(tokens.size).toBe(SAMPLE_SIZE)
    })
  })
}
