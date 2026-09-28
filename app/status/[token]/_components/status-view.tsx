import type { CustomerStep } from "@/src/core/domain/customer-steps"
import type { StatusView as View } from "@/src/core/use-cases/get-status-by-token"
import { cn } from "@/src/lib/utils"

const SUPPORT_EMAIL = "kontakt@gm-gastro.com"

/** Titles are the customer statuses, status lines the internal labels (launch plan § Context). */
function describe(step: CustomerStep): { title: string; line?: string; text?: string } {
  if (step.id === "paid") {
    return step.state === "current"
      ? { title: "Antrag eingegangen", line: "Zahlung wird bestätigt" }
      : { title: "Antrag eingegangen & bezahlt", line: "Zahlung erfasst", text: "Wir haben Ihren Antrag und Ihre Zahlung erhalten." }
  }
  if (step.id === "kba") {
    return { title: "An das KBA übermittelt", line: step.state === "pending" ? undefined : "KBA bearbeitet", text: "Ihr Antrag liegt beim Kraftfahrt-Bundesamt." }
  }
  switch (step.outcome) {
    case "completed":
      return { title: "Abmeldung abgeschlossen", line: "Vorgang abgeschlossen", text: "Ihr Fahrzeug ist abgemeldet. Kfz-Steuer und Versicherung enden automatisch." }
    case "failed_correctable":
      return { title: "Korrektur erforderlich", line: "Korrektur erforderlich", text: "Einige Angaben müssen korrigiert werden. Wir haben Ihnen dazu eine E-Mail geschickt." }
    case "failed_final":
      return { title: "Antrag abgelehnt", line: "Teilerstattung", text: "Der Antrag konnte nicht abgeschlossen werden. Wir haben Ihnen dazu eine E-Mail geschickt." }
    case "cancelled":
      return { title: "Antrag storniert", line: "Storniert", text: "Sie haben den Antrag storniert. Die Erstattung ist unterwegs." }
    default:
      return { title: "Ergebnis" }
  }
}

const when = (date: Date) =>
  new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(date)

/** site-contract §2.6: plate and the end of the VIN, never a security code; a vertical stepper at every size. */
export function StatusView({ view }: { view: View }) {
  const { licencePlate } = view
  return (
    <div className="flex flex-col gap-(--heading-space-above)">
      <header className="flex flex-col gap-(--heading-space-below)">
        <p className="text-small tracking-[0.1em] text-grau-bright uppercase">Auftrag {view.reference}</p>
        <h1 className="text-grau-dark">Ihre Abmeldung</h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body">
          <dt className="text-grau-bright">Kennzeichen</dt>
          <dd className="plate-text text-grau-dark">
            {licencePlate.prefix} {licencePlate.letters} {licencePlate.numbers}
          </dd>
          <dt className="text-grau-bright">FIN</dt>
          <dd className="text-grau-dark">endet auf {view.vinEnding}</dd>
        </dl>
      </header>

      <section aria-labelledby="status-steps">
        <h2 id="status-steps" className="sr-only">
          Stand Ihres Antrags
        </h2>
        <ol className="flex max-w-xl flex-col">
          {view.steps.map((step) => (
            <Step key={step.id} step={step} />
          ))}
        </ol>
      </section>

      <section aria-labelledby="status-help" className="measure flex flex-col gap-2">
        <h2 id="status-help" className="text-h4 text-grau-dark">
          Hilfe
        </h2>
        <p className="text-body text-grau">
          Fragen zu Ihrem Antrag? Schreiben Sie uns an{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-4 hover:text-orange-dark">
            {SUPPORT_EMAIL}
          </a>{" "}
          und nennen Sie Ihre Auftragsnummer.
        </p>
      </section>
    </div>
  )
}

const MARKS: Record<CustomerStep["state"], string> = {
  pending: "border-2 border-grau-bright bg-white",
  current: "bg-orange animate-status-pulse",
  done: "bg-success",
  failed: "bg-error",
}

const ROWS: Record<CustomerStep["state"], string> = {
  pending: "text-grau-bright",
  current: "text-grau-dark",
  done: "bg-success-tint text-grau-dark",
  failed: "bg-error-tint text-grau-dark",
}

const STATE_LABELS: Record<CustomerStep["state"], string> = {
  pending: "ausstehend",
  current: "in Arbeit",
  done: "erledigt",
  failed: "nicht erfolgreich",
}

function Step({ step }: { step: CustomerStep }) {
  const { title, line, text } = describe(step)
  return (
    <li aria-current={step.state === "current" ? "step" : undefined} className={cn("flex gap-4 rounded-md p-4", ROWS[step.state])}>
      <span aria-hidden="true" className={cn("mt-1 size-3 shrink-0 rounded-full", MARKS[step.state])} />
      <div className="flex flex-col gap-1">
        <p className="text-subtitle">
          {title} <span className="sr-only">({STATE_LABELS[step.state]})</span>
        </p>
        {line && step.state !== "pending" ? <p className="text-small">{line}</p> : null}
        {text && step.state !== "pending" ? <p className="text-body text-grau">{text}</p> : null}
        {step.at ? (
          <p className="text-small text-grau-bright">
            <time dateTime={step.at.toISOString()}>{when(step.at)}</time>
          </p>
        ) : null}
      </div>
    </li>
  )
}
