import type { ReactNode } from "react"
import type { OrderChangeState } from "@/app/status/[token]/order-change-state"
import { Alert } from "@/src/ui/alert"

/**
 * What a correction form tells the customer after the server answered, the same for every service's form.
 * `refused` is the one answer whose meaning is the service's (the authority refused the data again, or the
 * identity still does not match), so the form says it. `invalid` has a general sentence only when no single
 * field is to blame; the fields' own wording is put at the fields.
 */
export function ChangeOutcome({ state, refused }: { state?: OrderChangeState; refused: ReactNode }) {
  switch (state?.status) {
    case "invalid":
      return state.general ? <Alert variant="error" role="alert">{state.general}</Alert> : null
    case "refused":
      return (
        <Alert variant="warning" role="alert">
          {refused}
        </Alert>
      )
    case "unavailable":
      return (
        <Alert variant="warning" role="alert">
          Die Zulassungsstelle ist gerade nicht erreichbar. Ihre Angaben sind nicht verloren: Bitte versuchen Sie es in einigen Minuten erneut.
        </Alert>
      )
    case "limited":
      return (
        <Alert variant="warning" role="alert">
          Zu viele Versuche. Bitte warten Sie {state.retryAfterMinutes} Minuten und versuchen Sie es dann erneut.
        </Alert>
      )
    case "failed":
      return (
        <Alert variant="error" role="alert">
          Das hat nicht geklappt. Bitte versuchen Sie es in einigen Minuten erneut. Es ist nichts verloren gegangen.
        </Alert>
      )
    default:
      return null
  }
}
