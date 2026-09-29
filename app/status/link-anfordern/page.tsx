import type { Metadata } from "next"
import { requestStatusLinkAction } from "./actions"
import { ResendLinkForm } from "./_components/resend-link-form"

export const metadata: Metadata = { title: "Statuslink erneut senden — ZulexGO", robots: { index: false, follow: false } }

export default function ResendLinkPage() {
  return (
    <div className="flex flex-col gap-(--heading-space-above)">
      <header className="flex flex-col gap-(--heading-space-below)">
        <h1 className="text-grau-dark">Statuslink erneut senden</h1>
        <p className="measure text-body text-grau">
          Geben Sie Ihre Auftragsnummer und die E-Mail-Adresse ein, die Sie beim Antrag angegeben haben. Passt beides, schicken wir
          Ihnen einen neuen Link. Der bisherige Link funktioniert danach nicht mehr.
        </p>
      </header>
      <ResendLinkForm action={requestStatusLinkAction} />
    </div>
  )
}
