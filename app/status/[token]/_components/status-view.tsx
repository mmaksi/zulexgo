import { Download } from "lucide-react"
import Link from "next/link"
import { SUPPORT_EMAIL } from "@/src/core/domain/contact"
import type { CustomerStep } from "@/src/core/domain/customer-steps"
import type { DocumentKind } from "@/src/core/domain/document"
import { formatEuros } from "@/src/core/domain/money"
import type { StatusView as View } from "@/src/core/use-cases/get-status-by-token"
import { cn } from "@/src/lib/utils"
import { Alert } from "@/src/ui/alert"
import { buttonLink } from "@/src/ui/button"
import { PlateFrame } from "@/src/ui/plate-frame"
import { CancelOrder, type CancelOrderAction } from "./cancel-order"

/** Titles are the customer statuses, status lines the internal labels (launch plan § Context). */
function describe(step: CustomerStep, failureReason?: string): { title: string; line?: string; text?: string } {
  if (step.id === "paid") {
    return step.state === "current"
      ? { title: "Antrag eingegangen", line: "Zahlung wird bestätigt" }
      : {
          title: "Antrag eingegangen",
          line: "Betrag reserviert",
          text: "Wir haben Ihren Antrag erhalten und den Betrag auf Ihrer Karte reserviert. Abgebucht wird er erst mit dem Ergebnis.",
        }
  }
  if (step.id === "kba") {
    return { title: "An das KBA übermittelt", line: step.state === "pending" ? undefined : "KBA bearbeitet", text: "Ihr Antrag liegt beim Kraftfahrt-Bundesamt." }
  }
  switch (step.outcome) {
    case "completed":
      return { title: "Abmeldung abgeschlossen", line: "Vorgang abgeschlossen", text: "Ihr Fahrzeug ist abgemeldet. Kfz-Steuer und Versicherung enden automatisch." }
    case "failed_correctable":
      return { title: "Korrektur erforderlich", line: "Korrektur erforderlich", text: failureReason }
    case "failed_final":
      return { title: "Antrag abgelehnt", line: "Erstattung", text: `${failureReason ?? ""} Eine Korrektur ist nicht möglich.`.trim() }
    case "cancelled":
      return { title: "Antrag storniert", line: "Storniert", text: "Sie haben den Antrag storniert." }
    default:
      return { title: "Ergebnis" }
  }
}

const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  confirmation: "Bestätigung der Abmeldung",
  rejection: "Ablehnung",
  fee: "Gebührenbeleg",
  unknown: "Dokument",
}

const when = (date: Date) =>
  new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(date)

/**
 * site-contract §2.6: plate and the end of the VIN, never a security code; a
 * vertical stepper at every size. `documentHref` builds a download link, the
 * one place a page repeats its own token; `cancelAction` is the server action
 * bound to it.
 */
export function StatusView({
  view,
  documentHref,
  cancelAction,
}: {
  view: View
  documentHref: (documentId: string) => string
  cancelAction: CancelOrderAction
}) {
  const { licencePlate } = view
  return (
    <div className="flex flex-col gap-(--heading-space-above)">
      <header className="flex flex-col gap-(--heading-space-below)">
        <p className="text-small tracking-[0.1em] text-grau-bright uppercase">Auftrag {view.reference}</p>
        <h1 className="text-grau-dark">Ihre Abmeldung</h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body">
          <dt className="text-grau-bright">Kennzeichen</dt>
          <dd>
            <PlateFrame className="inline-flex">
              <span className="plate-text block px-3 py-1 text-grau-dark">
                {licencePlate.prefix} {licencePlate.letters} {licencePlate.numbers}
              </span>
            </PlateFrame>
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
            <Step key={step.id} step={step} failureReason={view.failureReason} />
          ))}
        </ol>
      </section>

      <OutcomeBlock view={view} documentHref={documentHref} cancelAction={cancelAction} />

      <section aria-labelledby="status-help" className="measure flex flex-col gap-2">
        <h2 id="status-help" className="text-h4 text-grau-dark">
          Hilfe
        </h2>
        <p className="text-body text-grau">
          Fragen zu Ihrem Antrag? Schreiben Sie uns an <MailLink /> und nennen Sie Ihre Auftragsnummer.
        </p>
        <p className="text-body text-grau">
          Statuslink verloren?{" "}
          <Link href="/status/link-anfordern" className="underline underline-offset-4 hover:text-orange-dark">
            Wir senden ihn erneut
          </Link>
          .
        </p>
      </section>
    </div>
  )
}

function MailLink() {
  return (
    <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-4 hover:text-orange-dark">
      {SUPPORT_EMAIL}
    </a>
  )
}

/** site-contract §2.6: what to do next, by outcome. */
function OutcomeBlock({
  view,
  documentHref,
  cancelAction,
}: {
  view: View
  documentHref: (documentId: string) => string
  cancelAction: CancelOrderAction
}) {
  const outcome = view.steps.find((step) => step.id === "outcome")?.outcome
  if (!outcome) return null

  switch (outcome) {
    case "completed":
      return <Documents view={view} documentHref={documentHref} />
    case "failed_correctable":
      return (
        <section aria-labelledby="status-options" className="measure flex flex-col gap-6">
          <h2 id="status-options" className="text-h4 text-grau-dark">
            Wie möchten Sie fortfahren?
          </h2>
          <Alert variant="warning">
            Schreiben Sie uns an <MailLink /> und nennen Sie Ihre Auftragsnummer {view.reference}. Wir korrigieren den Antrag gemeinsam
            mit Ihnen. Sie zahlen nur die Differenz, falls Mehrkosten entstehen.
          </Alert>
          {view.cancellation ? (
            <CancelOrder action={cancelAction} returned={formatEuros(view.cancellation.returned)} retained={formatEuros(view.cancellation.retained)} />
          ) : null}
        </section>
      )
    case "failed_final":
    case "cancelled":
      return (
        <div className="measure flex flex-col items-start gap-4">
          <Alert variant={outcome === "failed_final" ? "error" : "info"} className="w-full">
            <RefundInfo refund={view.refund} />
          </Alert>
          <Link href="/deregister" className={buttonLink({ variant: "outline" })}>
            Neuen Antrag stellen
          </Link>
        </div>
      )
  }
}

function RefundInfo({ refund }: { refund: View["refund"] }) {
  if (!refund) return <p>Wie viel Sie zurückerhalten, steht in unserer E-Mail dazu.</p>
  return (
    <p>
      Sie erhalten {formatEuros(refund.returned)} zurück.
      {refund.retained.cents > 0 ? ` Die Bearbeitungsgebühr von ${formatEuros(refund.retained)} behalten wir ein.` : ""} Je nach Bank
      ist der Betrag in 3 bis 5 Werktagen auf Ihrem Konto.
    </p>
  )
}

function Documents({ view, documentHref }: { view: View; documentHref: (documentId: string) => string }) {
  return (
    <section aria-labelledby="status-documents" className="flex flex-col gap-4">
      <h2 id="status-documents" className="text-h4 text-grau-dark">
        Ihre Bestätigung
      </h2>
      {view.documents.length > 0 ? (
        <ul className="flex flex-col items-start gap-3">
          {view.documents.map(({ id, kind }) => (
            <li key={id}>
              <a href={documentHref(id)} className={buttonLink({ variant: "outline", className: "h-auto min-h-12 py-3 text-left whitespace-normal" })}>
                <Download aria-hidden="true" />
                {DOCUMENT_LABELS[kind]} herunterladen
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="measure text-body text-grau">
          Die Bestätigung steht hier zum Download bereit, sobald sie vorliegt. Fehlt sie länger, schreiben Sie uns an <MailLink />.
        </p>
      )}
    </section>
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

function Step({ step, failureReason }: { step: CustomerStep; failureReason?: string }) {
  const { title, line, text } = describe(step, failureReason)
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
