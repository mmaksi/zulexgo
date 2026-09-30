/** The fields a correction can change; the plate cannot (launch plan Q26). */
export type CorrectionField = "vin" | "rearPlate" | "frontPlate" | "certificate"

/** What the status page is told after the customer tries to change an order. Kept apart from the server code so the browser bundle can import it. */
export type OrderChangeState =
  | { status: "done" }
  /** The link opens nothing, or the order is no longer waiting for a correction: the page as it stands says what is left. */
  | { status: "notPossible" }
  | { status: "limited"; retryAfterMinutes: number }
  /** Money or email failed; nothing is lost and asking again finishes the job. */
  | { status: "failed" }
  /** A correction with wrong fields, or none: `general` speaks for the whole form. */
  | { status: "invalid"; errors: Partial<Record<CorrectionField, string>>; general?: string }
  /** The service looked at the corrected data and refused it; the order is unchanged. */
  | { status: "refused" }
  /** The service could not be reached; the order is unchanged and asking again later may work. */
  | { status: "unavailable" }
