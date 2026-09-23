import { TOKEN_MIN_LENGTH, TOKEN_PATTERN, type TokenGenerator } from "./token-generator"

const SAMPLE_SIZE = 1000

/** Every TokenGenerator adapter must pass this, including the fake. */
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
