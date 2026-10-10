export type ResendFormState =
  | { status: "invalid"; errors: { reference?: string; email?: string } }
  | { status: "accepted" }
  | { status: "limited"; retryAfterMinutes: number }
  | { status: "unavailable" }
