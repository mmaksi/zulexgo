/** What the resend form is told. Kept apart from the server code so the browser bundle can import it. */
export type ResendFormState =
  | { status: "invalid"; errors: { reference?: string; email?: string } }
  | { status: "accepted" }
  | { status: "limited"; retryAfterMinutes: number }
  /** Only ever set by the browser, when the request itself failed. */
  | { status: "unavailable" }
