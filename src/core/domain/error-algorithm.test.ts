import { decideOnFailure, type ErrorCatalogue } from "./error-algorithm"

const CATALOGUE: ErrorCatalogue = { 500: "technical", 101: "correctable", 202: "final" }
const kbaError = (code: number) => ({ kind: "kbaError", code }) as const

describe("decideOnFailure (business logic §2, one silent retry)", () => {
  describe("the service could not be reached at submission", () => {
    it("retries once without telling the customer", () => {
      expect(decideOnFailure({ kind: "unavailable" }, 0, CATALOGUE)).toEqual({ action: "retrySilently" })
    })

    it("then fails for good with a full refund: nothing reached the KBA, so nothing can be corrected", () => {
      expect(decideOnFailure({ kind: "unavailable" }, 1, CATALOGUE)).toEqual({ action: "failFinal", refund: "full" })
    })
  })

  it("does not retry data the service refused at submission, since it would fail again (Q18)", () => {
    expect(decideOnFailure({ kind: "rejected" }, 0, CATALOGUE)).toEqual({ action: "failCorrectable" })
  })

  describe("a KBA error", () => {
    it("retries a technical error once, then makes it correctable", () => {
      expect(decideOnFailure(kbaError(500), 0, CATALOGUE)).toEqual({ action: "retrySilently" })
      expect(decideOnFailure(kbaError(500), 1, CATALOGUE)).toEqual({ action: "failCorrectable" })
    })

    it("sends a correctable error straight to 5b, without a retry", () => {
      expect(decideOnFailure(kbaError(101), 0, CATALOGUE)).toEqual({ action: "failCorrectable" })
    })

    it("sends a non-correctable error straight to 5c, keeping the processing fee", () => {
      expect(decideOnFailure(kbaError(202), 0, CATALOGUE)).toEqual({ action: "failFinal", refund: "fee" })
    })

    it("treats a code the catalogue does not know as technical: one retry, then 5b", () => {
      expect(decideOnFailure(kbaError(999), 0, CATALOGUE)).toEqual({ action: "retrySilently" })
      expect(decideOnFailure(kbaError(999), 1, CATALOGUE)).toEqual({ action: "failCorrectable" })
    })
  })

  it("makes a finished application with only a rejection document correctable, as it carries no error to retry", () => {
    expect(decideOnFailure({ kind: "rejectionDocument" }, 0, CATALOGUE)).toEqual({ action: "failCorrectable" })
  })
})
