/** What the status page is told after the customer tries to change an order. Kept apart from the server code so the browser bundle can import it. */
export type OrderChangeState =
  | { status: "done" }
  /** The link opens nothing, or the order is no longer waiting for a correction: the page as it stands says what is left. */
  | { status: "notPossible" }
  | { status: "limited"; retryAfterMinutes: number }
  /** Money or email failed; nothing is lost and asking again finishes the job. */
  | { status: "failed" }
