import type { IkfzStatus } from "@/src/core/domain/registration/registration-authority"
import { Alert } from "@/src/ui/alert"

/** site-contract §2.2: the processing-time expectation, set before payment. */
const NOTICES: Record<IkfzStatus, string> = {
  online: "Ihre Zulassungsstelle bearbeitet Abmeldungen online. Meist ist Ihr Antrag in wenigen Minuten bis Stunden erledigt.",
  unavailable:
    "Ihre Zulassungsstelle ist gerade nicht online erreichbar. Ihr Antrag wird dann von Hand bearbeitet, das kann einige Tage dauern.",
  offline: "Ihre Zulassungsstelle bearbeitet Abmeldungen von Hand. Das kann einige Tage dauern.",
}

export function AvailabilityNotice({ ikfzStatus }: { ikfzStatus: IkfzStatus }) {
  const manual = ikfzStatus !== "online"
  return (
    <Alert variant={manual ? "warning" : "info"} className="measure">
      {NOTICES[ikfzStatus]}
    </Alert>
  )
}
