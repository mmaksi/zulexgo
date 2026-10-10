import type { Metadata } from "next"
import Link from "next/link"
import { applicationReferenceSchema } from "@/src/core/domain/application/application-reference"
import { buttonLink } from "@/src/ui/button"
import { Confirmation } from "@/app/(funnel)/deregister/_components/confirmation"

export const metadata: Metadata = { title: "Antrag eingegangen — ZulexGO", robots: { index: false } }

export default async function ConfirmationPage({ searchParams }: PageProps<"/deregister/bestaetigung">) {
  const { auftrag, redirect_status: status } = await searchParams
  const reference = applicationReferenceSchema.safeParse(auftrag)

  if (!reference.success || status === "failed") {
    return (
      <div className="flex flex-col gap-(--heading-space-below)">
        <h1 className="text-grau-dark">Zahlung nicht abgeschlossen</h1>
        <p className="measure text-body text-grau">Die Zahlung wurde nicht abgeschlossen. Es wurde nichts abgebucht.</p>
        <div>
          <Link href="/deregister" className={buttonLink()}>
            Erneut versuchen
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-(--heading-space-below)">
      <h1 className="text-grau-dark">Ihr Antrag ist eingegangen</h1>
      <Confirmation reference={reference.data} />
    </div>
  )
}
