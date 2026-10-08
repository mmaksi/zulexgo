import { decideOnFailure, SUBMISSION_PATIENCE_MS, type Attempt } from "./error-algorithm"
import type { RejectionCatalogue } from "./rejection-catalogue"

const CATALOGUE: RejectionCatalogue = {
  500: { class: "technical", reason: "Ein technischer Fehler." },
  101: { class: "correctable", reason: "Korrigierbar." },
  202: { class: "final", reason: "Endgültig." },
}
const kbaError = (code: number) => ({ kind: "kbaError", code }) as const
const attempt = (retryAttempts: number, waitedMs = 0): Attempt => ({ retryAttempts, waitedMs })

describe("decideOnFailure (business logic §2, one silent retry)", () => {
  describe("the service could not be reached at submission (the application may still have reached it: D6)", () => {
    it("retries without telling the customer, however many times it has already retried", () => {
      expect(decideOnFailure({ kind: "unavailable" }, attempt(0), CATALOGUE)).toEqual({ action: "retrySilently" })
      expect(decideOnFailure({ kind: "unavailable" }, attempt(9, 60_000), CATALOGUE)).toEqual({ action: "retrySilently" })
    })

    it("keeps retrying until the patience is used up, then fails for good with a full refund", () => {
      expect(decideOnFailure({ kind: "unavailable" }, attempt(20, SUBMISSION_PATIENCE_MS - 1), CATALOGUE)).toEqual({ action: "retrySilently" })
      expect(decideOnFailure({ kind: "unavailable" }, attempt(20, SUBMISSION_PATIENCE_MS), CATALOGUE)).toEqual({
        action: "failFinal",
        refund: "full",
      })
    })
  })

  it("does not retry data the service refused at submission, since it would fail again (Q18)", () => {
    expect(decideOnFailure({ kind: "rejected" }, attempt(0), CATALOGUE)).toEqual({ action: "failCorrectable" })
  })

  describe("a KBA error", () => {
    it("retries a technical error once, then makes it correctable", () => {
      expect(decideOnFailure(kbaError(500), attempt(0), CATALOGUE)).toEqual({ action: "retrySilently" })
      expect(decideOnFailure(kbaError(500), attempt(1), CATALOGUE)).toEqual({ action: "failCorrectable" })
    })

    it("sends a correctable error straight to 5b, without a retry", () => {
      expect(decideOnFailure(kbaError(101), attempt(0), CATALOGUE)).toEqual({ action: "failCorrectable" })
    })

    it("sends a non-correctable error straight to 5c, keeping the processing fee", () => {
      expect(decideOnFailure(kbaError(202), attempt(0), CATALOGUE)).toEqual({ action: "failFinal", refund: "fee" })
    })

    it("treats a code the catalogue does not know as technical: one retry, then 5b", () => {
      expect(decideOnFailure(kbaError(999), attempt(0), CATALOGUE)).toEqual({ action: "retrySilently" })
      expect(decideOnFailure(kbaError(999), attempt(1), CATALOGUE)).toEqual({ action: "failCorrectable" })
    })
  })

  it("makes a finished application with only a rejection document correctable, as it carries no error to retry", () => {
    expect(decideOnFailure({ kind: "rejectionDocument" }, attempt(0), CATALOGUE)).toEqual({ action: "failCorrectable" })
  })

  describe("an identity verification that ended without success (business logic §2, launch plan Q47, provisional)", () => {
    it("makes a failed verification final, keeping the processing fee, and never retries it", () => {
      expect(decideOnFailure({ kind: "identityFailed" }, attempt(0), CATALOGUE)).toEqual({ action: "failFinal", refund: "fee" })
      expect(decideOnFailure({ kind: "identityFailed" }, attempt(5), CATALOGUE)).toEqual({ action: "failFinal", refund: "fee" })
    })

    it("makes a verified person who is not the owner on the order correctable, since nothing was filed", () => {
      expect(decideOnFailure({ kind: "identityMismatch" }, attempt(0), CATALOGUE)).toEqual({ action: "failCorrectable" })
    })
  })
})
