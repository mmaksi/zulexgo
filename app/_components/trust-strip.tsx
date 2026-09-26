import { Landmark, ListChecks, Lock } from "lucide-react"

// site-contract.md §2.1 — exactly three items, label <=40 chars.
const TRUST = [
  {
    icon: Landmark,
    label: "Amtlicher Vorgang über das KBA",
    detail: "Übermittlung über die i-Kfz-Schnittstelle",
  },
  {
    icon: Lock,
    label: "Sichere Zahlung über Stripe",
    detail: "Belastung erst nach Übermittlung",
  },
  {
    icon: ListChecks,
    label: "Status jederzeit nachverfolgbar",
    detail: "Persönlicher Link per E-Mail",
  },
]

export function TrustStrip() {
  return (
    <section aria-label="Vertrauen und Sicherheit" className="bg-bg-blue">
      <ul className="page-frame grid gap-6 py-8 md:grid-cols-3 md:gap-8 md:py-10">
        {TRUST.map(({ icon: Icon, label, detail }) => (
          <li key={label} className="flex items-start gap-4">
            <Icon
              aria-hidden="true"
              className="mt-0.5 size-6 shrink-0 text-grau"
              strokeWidth={1.5}
            />
            <div>
              <p className="text-body text-grau-dark">{label}</p>
              <p className="mt-1 text-small text-grau-bright">{detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
