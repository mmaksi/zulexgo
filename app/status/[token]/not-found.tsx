import Link from "next/link"
import { SUPPORT_EMAIL } from "@/src/core/domain/customer/contact"

export default function StatusLinkNotFound() {
  return (
    <div className="flex flex-col gap-(--heading-space-below)">
      <h1 className="text-grau-dark">Link nicht gültig</h1>
      <p className="measure text-body text-grau">
        Dieser Statuslink ist nicht gültig. Bitte öffnen Sie den Link aus Ihrer neuesten E-Mail von ZulexGO.
      </p>
      <p className="measure text-body text-grau">
        Sie finden ihn nicht mehr?{" "}
        <Link href="/status/link-anfordern" className="underline underline-offset-4 hover:text-orange-dark">
          Wir senden ihn erneut
        </Link>
        , oder Sie schreiben uns an {SUPPORT_EMAIL} und nennen Ihre Auftragsnummer.
      </p>
    </div>
  )
}
