// Provisional: launch plan Q26 (the plate cannot be changed)
export type DeregistrationCorrectionField = "vin" | "rearPlate" | "frontPlate" | "certificate"

// Provisional: launch plan Q47 (name and birth date correctable until the identity is verified)
export type NewRegistrationCorrectionField = "evbNumber" | "part2Number" | "part2SecurityCode" | "firstName" | "lastName" | "birthDate"

export type CorrectionField = DeregistrationCorrectionField | NewRegistrationCorrectionField

export type OrderChangeState =
  | { status: "done" }
  | { status: "notPossible" }
  | { status: "limited"; retryAfterMinutes: number }
  | { status: "failed" }
  | { status: "invalid"; errors: Partial<Record<CorrectionField, string>>; general?: string }
  | { status: "refused" }
  | { status: "unavailable" }
