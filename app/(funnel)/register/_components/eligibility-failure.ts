import { tooManyAttempts } from "@/app/(funnel)/too-many-attempts"
import type { RegistrationActions } from "./registration-actions"

export const UNREACHABLE = "Die Zulassungsstelle ist gerade nicht zu erreichen. Bitte versuchen Sie es in ein paar Minuten noch einmal."

type Failure = Extract<Awaited<ReturnType<RegistrationActions["checkEligibility"]>>, { ok: false }>

export function failureWording(failure: Failure): string {
  switch (failure.reason) {
    case "invalidPostcode":
      return "Für diese Postleitzahl finden wir keine Zulassungsstelle. Prüfen Sie die 5 Ziffern."
    case "limited":
      return tooManyAttempts(failure.retryAfterMinutes)
    case "unavailable":
      return UNREACHABLE
  }
}
