import type { IkfzStatus } from "@/src/core/domain/registration-authority"

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
    <p
      className={
        manual
          ? "measure border-l-4 border-warning bg-warning-tint p-4 text-body text-grau-dark"
          : "measure border-l-4 border-grau bg-info-tint p-4 text-body text-grau-dark"
      }
    >
      {NOTICES[ikfzStatus]}
    </p>
  )
}
