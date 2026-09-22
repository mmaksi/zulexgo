import type { Metadata } from "next"
import { Wedge } from "@/src/ui/wedge"
import { Faq } from "./_components/faq"
import { Hero } from "./_components/hero"
import { HowItWorks } from "./_components/how-it-works"
import { ServiceSelection } from "./_components/service-selection"
import { TrustStrip } from "./_components/trust-strip"

export const metadata: Metadata = {
  title: "ZulexGO — Fahrzeug online abmelden",
  description:
    "Außerbetriebsetzung in unter 10 Minuten: offiziell über das KBA, ohne Termin bei der Zulassungsstelle.",
}

// site-contract.md §1 — landing page section order.
export default function LandingPage() {
  return (
    <>
      <Hero />
      <TrustStrip />
      <ServiceSelection />
      {/* §5.1 at most one section wedge per viewport height */}
      <Wedge />
      <HowItWorks />
      <Faq />
    </>
  )
}
