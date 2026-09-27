import { InvalidTransition } from "@/src/core/errors/invalid-transition"
import {
  APPLICATION_EVENTS,
  APPLICATION_STATUSES,
  advance,
  isTerminal,
  type ApplicationEvent,
  type ApplicationStatus,
} from "./application-status"

/** Owned by the test, not imported: business logic §1–§3 without Verimi (decided 2026-09-26). */
const LEGAL: [ApplicationStatus, ApplicationEvent, ApplicationStatus][] = [
  ["awaiting_payment", "paymentConfirmed", "submitted_and_paid"],
  ["submitted_and_paid", "submittedToKba", "submitted_to_kba"],
  ["submitted_and_paid", "failedCorrectable", "failed_correctable"],
  ["submitted_and_paid", "failedFinal", "failed_final"],
  ["submitted_to_kba", "kbaProcessing", "submitted_to_kba"],
  ["submitted_to_kba", "kbaCompleted", "completed"],
  ["submitted_to_kba", "failedCorrectable", "failed_correctable"],
  ["submitted_to_kba", "failedFinal", "failed_final"],
  ["failed_correctable", "correctionResubmitted", "submitted_to_kba"],
  ["failed_correctable", "cancelledByCustomer", "cancelled"],
]

const isLegal = (status: ApplicationStatus, event: ApplicationEvent) =>
  LEGAL.some(([from, on]) => from === status && on === event)

const ILLEGAL = APPLICATION_STATUSES.flatMap((status) =>
  APPLICATION_EVENTS.filter((event) => !isLegal(status, event)).map((event) => [status, event] as const),
)

describe("advance", () => {
  it.each(LEGAL)("%s --%s--> %s", (from, event, to) => {
    expect(advance(from, event)).toBe(to)
  })

  it.each(ILLEGAL)("rejects %s --%s-->", (from, event) => {
    expect(() => advance(from, event)).toThrow(InvalidTransition)
  })
})

describe("isTerminal", () => {
  it.each(APPLICATION_STATUSES)("%s is terminal exactly when no event leaves it", (status) => {
    const hasExit = LEGAL.some(([from]) => from === status)

    expect(isTerminal(status)).toBe(!hasExit)
  })

  it("ends at completed, failed_final and cancelled", () => {
    expect(APPLICATION_STATUSES.filter(isTerminal)).toEqual(["completed", "failed_final", "cancelled"])
  })
})
