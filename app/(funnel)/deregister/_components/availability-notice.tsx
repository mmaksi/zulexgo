import { ProcessingNotice } from "@/app/(funnel)/_components/processing-notice"
import type { IkfzStatus } from "@/src/core/domain/registration/registration-authority"

const NOTICES: Record<IkfzStatus, string> = {
  online: "Ihre Zulassungsstelle bearbeitet Abmeldungen online. Meist ist Ihr Antrag in wenigen Minuten bis Stunden erledigt.",
  unavailable:
    "Ihre Zulassungsstelle ist gerade nicht online erreichbar. Ihr Antrag wird dann von Hand bearbeitet, das kann einige Tage dauern.",
  offline: "Ihre Zulassungsstelle bearbeitet Abmeldungen von Hand. Das kann einige Tage dauern.",
}

export function AvailabilityNotice({ ikfzStatus }: { ikfzStatus: IkfzStatus }) {
  return <ProcessingNotice ikfzStatus={ikfzStatus} notices={NOTICES} />
}
