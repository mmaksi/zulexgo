import { Download } from "lucide-react"
import Link from "next/link"
import { FUNNELS } from "@/app/_components/funnels"
import { SUPPORT_EMAIL } from "@/src/core/domain/customer/contact"
import type { CustomerStep } from "@/src/core/domain/application/customer-steps"
import { isOnSale } from "@/src/core/domain/application/service"
import type { DocumentKind } from "@/src/core/domain/registration/document"
import { NEW_REGISTRATION_NEXT_STEPS } from "@/src/core/domain/registration/new-registration-next-steps"
import { formatEuros } from "@/src/core/domain/payment/money"
import type { StatusView as View } from "@/src/core/use-cases/status/get-status-by-token"
import { cn } from "@/src/lib/utils"
import { Alert } from "@/src/ui/alert"
import { buttonLink } from "@/src/ui/button"
import { PlateFrame } from "@/src/ui/plate-frame"
import { CancelOrder, type CancelOrderAction } from "./cancel-order"
import { CorrectNewRegistration, type CorrectNewRegistrationAction } from "./correct-new-registration"
import { CorrectOrder, type CorrectOrderAction } from "./correct-order"

/** The bound server action reads any input and answers for the order's own service, so one action serves either form. */
type CorrectAction = CorrectOrderAction & CorrectNewRegistrationAction

const when = (date: Date) =>
  new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(date)

/** Titles are the customer statuses, status lines the internal labels (launch plan § Context). */
function describe(step: CustomerStep, view: View): { title: string; line?: string; text?: string } {
  const { failureReason } = view
  if (step.id === "paid") {
    return step.state === "current"
      ? { title: "Antrag eingegangen", line: "Zahlung wird bestätigt" }
      : {
          title: "Antrag eingegangen",
          line: "Zahlung erhalten",
          text: "Wir haben Ihren Antrag erhalten. Ihre Karte wird belastet, sobald er eingereicht ist, spätestens kurz vor Ablauf der Kartenreservierung.",
        }
  }
  // Their explanations are about waiting, so a finished step keeps only its status line.
  if (step.id === "verification") {
    if (step.rechecking) {
      return { title: "Identität prüfen", line: "Angaben werden geprüft", text: "Wir gleichen Ihre korrigierten Angaben mit Ihrer Identitätsprüfung ab. Das dauert nur einen Moment." }
    }
    const deadline = view.service === "newRegistration" ? view.verificationDeadline : undefined
    return {
      title: "Identität prüfen",
      line: step.state === "done" ? "Identität bestätigt" : "Wartet auf Ihre Bestätigung",
      text:
        step.state === "current"
          ? `Wir reichen Ihren Antrag erst ein, wenn Sie Ihre Identität bestätigt haben. Den Link dazu haben wir Ihnen per E-Mail geschickt.${
              deadline ? ` Bitte bestätigen Sie bis ${when(deadline)}. Danach stornieren wir den Auftrag, und Sie erhalten den vollen Betrag zurück.` : ""
            }`
          : undefined,
    }
  }
  if (step.id === "verified") {
    return {
      title: "Identität bestätigt",
      line: step.state === "done" ? "Bestätigt" : "Antrag wird eingereicht",
      text: step.state === "current" ? "Wir reichen Ihren Antrag jetzt beim Kraftfahrt-Bundesamt ein." : undefined,
    }
  }
  if (step.id === "kba") {
    return { title: "An das KBA übermittelt", line: step.state === "pending" ? undefined : "KBA bearbeitet", text: "Ihr Antrag liegt beim Kraftfahrt-Bundesamt." }
  }
  switch (step.outcome) {
    case "completed":
      return view.service === "newRegistration"
        ? { title: "Neuzulassung abgeschlossen", line: "Vorgang abgeschlossen", text: "Das KBA hat Ihre Neuzulassung bestätigt. Ihre Unterlagen finden Sie unten." }
        : { title: "Abmeldung abgeschlossen", line: "Vorgang abgeschlossen", text: "Ihr Fahrzeug ist abgemeldet. Kfz-Steuer und Versicherung enden automatisch." }
    case "failed_correctable":
      return { title: "Korrektur erforderlich", line: "Korrektur erforderlich", text: failureReason }
    case "failed_final":
      return { title: "Antrag abgelehnt", line: "Erstattung", text: `${failureReason ?? ""} Eine Korrektur ist nicht möglich.`.trim() }
    case "cancelled":
      return step.verificationExpired
        ? { title: "Antrag storniert", line: "Storniert", text: "Sie haben Ihre Identität nicht rechtzeitig bestätigt. Deshalb haben wir den Auftrag storniert, ohne etwas einzureichen." }
        : { title: "Antrag storniert", line: "Storniert", text: "Sie haben den Antrag storniert." }
    default:
      return { title: "Ergebnis" }
  }
}

const TITLES: Record<View["service"], string> = {
  deregistration: "Ihre Abmeldung",
  newRegistration: "Ihre Neuzulassung",
}

/** What the order is about, as the service sees it: for a de-registration, the plate and the end of the VIN; for a Neuzulassung, which has no plate yet, the VIN. */
function Summary({ view }: { view: View }) {
  switch (view.service) {
    case "deregistration":
      return (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body">
          <dt className="text-grau-bright">Kennzeichen</dt>
          <dd>
            <PlateFrame className="inline-flex">
              <span className="plate-text block px-3 py-1 text-grau-dark">
                {view.licencePlate.prefix} {view.licencePlate.letters} {view.licencePlate.numbers}
              </span>
            </PlateFrame>
          </dd>
          <dt className="text-grau-bright">FIN</dt>
          <dd className="text-grau-dark">endet auf {view.vinEnding}</dd>
        </dl>
      )
    case "newRegistration":
      return (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body">
          <dt className="text-grau-bright">FIN</dt>
          <dd className="text-grau-dark">endet auf {view.vinEnding}</dd>
        </dl>
      )
  }
}

/**
 * What the customer may correct, which fields the form asks for being the service's: a de-registration's VIN and
 * codes, a Neuzulassung's eVB number and Teil II, and its owner's name and birth date while its identity was never
 * verified.
 */
function Correction({ view, action }: { view: View; action: CorrectAction }) {
  // An order whose provider has begun a cancel is offered no form: part of its money has gone back.
  if (view.correctable === false) {
    return (
      <Alert role="status" variant="warning">
        Ihre Stornierung wurde begonnen, aber noch nicht abgeschlossen. Ein Teil Ihres Geldes ist schon unterwegs, deshalb lässt sich der
        Antrag nicht mehr korrigieren. Bitte schließen Sie die Stornierung ab.
      </Alert>
    )
  }
  const ownerCorrectable = view.service === "newRegistration" && view.ownerCorrectable === true
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-subtitle text-grau-dark">Angaben korrigieren</h3>
      <p className="text-body text-grau">
        {ownerCorrectable
          ? "Korrigieren Sie Ihre Angaben. Wir prüfen Ihre Identität dann erneut. Das kostet nichts extra."
          : "Korrigieren Sie Ihre Angaben und reichen Sie den Antrag erneut ein. Das kostet nichts extra."}
      </p>
      {view.service === "deregistration" ? (
        <CorrectOrder action={action} plateCount={view.plateCount} />
      ) : (
        <CorrectNewRegistration action={action} ownerCorrectable={ownerCorrectable} />
      )}
    </div>
  )
}

const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  confirmation: "Bestätigung der Abmeldung",
  temporaryCertificate: "Vorläufiger Zulassungsnachweis",
  rejection: "Ablehnung",
  fee: "Gebührenbeleg",
  unknown: "Dokument",
}

/** The kinds a Neuzulassung's documents call by another name: its confirmation is of the registration, not a de-registration. */
const NEW_REGISTRATION_LABELS: Partial<Record<DocumentKind, string>> = { confirmation: "Bestätigung der Zulassung" }

const documentLabel = (service: View["service"], kind: DocumentKind) => (service === "newRegistration" ? NEW_REGISTRATION_LABELS[kind] : undefined) ?? DOCUMENT_LABELS[kind]

/**
 * site-contract §2.6: plate and the end of the VIN, never a security code; a
 * vertical stepper at every size. `documentHref` builds a download link, the
 * one place a page repeats its own token; `cancelAction` is the server action
 * bound to it, as is `correctAction`.
 */
export function StatusView({
  view,
  documentHref,
  cancelAction,
  correctAction,
}: {
  view: View
  documentHref: (documentId: string) => string
  cancelAction: CancelOrderAction
  correctAction: CorrectAction
}) {
  return (
    <div className="flex flex-col gap-(--heading-space-above)">
      <header className="flex flex-col gap-(--heading-space-below)">
        <p className="text-small tracking-[0.1em] text-grau-bright uppercase">Auftrag {view.reference}</p>
        <h1 className="text-grau-dark">{TITLES[view.service]}</h1>
        <Summary view={view} />
      </header>

      <section aria-labelledby="status-steps">
        <h2 id="status-steps" className="sr-only">
          Stand Ihres Antrags
        </h2>
        <ol className="flex max-w-xl flex-col">
          {view.steps.map((step) => (
            <Step key={step.id} step={step} view={view} />
          ))}
        </ol>
      </section>

      <OutcomeBlock view={view} documentHref={documentHref} cancelAction={cancelAction} correctAction={correctAction} />

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
  correctAction,
}: {
  view: View
  documentHref: (documentId: string) => string
  cancelAction: CancelOrderAction
  correctAction: CorrectAction
}) {
  const outcome = view.steps.find((step) => step.id === "outcome")?.outcome
  if (!outcome) return null
  // Another try goes to the service's own funnel, once it is on sale; until then, to the start page.
  const funnel = isOnSale(view.service) ? FUNNELS[view.service] : undefined

  switch (outcome) {
    case "completed":
      return (
        <>
          <Documents view={view} documentHref={documentHref} />
          {view.service === "newRegistration" ? <NextSteps /> : null}
        </>
      )
    case "failed_correctable":
      return (
        <section aria-labelledby="status-options" className="measure flex flex-col gap-8">
          <h2 id="status-options" className="text-h4 text-grau-dark">
            Wie möchten Sie fortfahren?
          </h2>
          <Correction view={view} action={correctAction} />
          {view.cancellation ? (
            <div className="flex flex-col gap-4">
              <h3 className="text-subtitle text-grau-dark">Oder stornieren</h3>
              <CancelOrder action={cancelAction} returned={formatEuros(view.cancellation.returned)} retained={formatEuros(view.cancellation.retained)} />
            </div>
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
          <Link href={funnel?.href ?? "/"} className={buttonLink({ variant: "outline" })}>
            {funnel ? "Neuen Antrag stellen" : "Zur Startseite"}
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

/** What the downloads section says while the documents are not there yet, up to where it points to the support address. */
const NO_DOCUMENTS_YET: Record<View["service"], string> = {
  deregistration: "Die Bestätigung steht hier zum Download bereit, sobald sie vorliegt. Fehlt sie länger, schreiben Sie uns an",
  newRegistration: "Ihre Unterlagen stehen hier zum Download bereit, sobald sie vorliegen. Fehlen sie länger, schreiben Sie uns an",
}

/** What happens after a Neuzulassung is completed: what arrives by post, where the plate is, and that plates are made locally. */
function NextSteps() {
  return (
    <section aria-labelledby="status-next-steps" className="measure flex flex-col gap-4">
      <h2 id="status-next-steps" className="text-h4 text-grau-dark">
        Wie geht es weiter?
      </h2>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-grau">
        {NEW_REGISTRATION_NEXT_STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>
    </section>
  )
}

function Documents({ view, documentHref }: { view: View; documentHref: (documentId: string) => string }) {
  return (
    <section aria-labelledby="status-documents" className="flex flex-col gap-4">
      <h2 id="status-documents" className="text-h4 text-grau-dark">
        {view.service === "newRegistration" ? "Ihre Unterlagen" : "Ihre Bestätigung"}
      </h2>
      {view.documents.length > 0 ? (
        <ul className="flex flex-col items-start gap-3">
          {view.documents.map(({ id, kind }) => (
            <li key={id}>
              <a href={documentHref(id)} className={buttonLink({ variant: "outline", className: "h-auto min-h-12 py-3 text-left whitespace-normal" })}>
                <Download aria-hidden="true" />
                {documentLabel(view.service, kind)} herunterladen
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="measure text-body text-grau">
          {NO_DOCUMENTS_YET[view.service]} <MailLink />.
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

function Step({ step, view }: { step: CustomerStep; view: View }) {
  const { title, line, text } = describe(step, view)
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
