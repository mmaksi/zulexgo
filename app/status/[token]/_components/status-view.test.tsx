import { render, screen } from "@testing-library/react"
import { customerSteps } from "@/src/core/domain/application/customer-steps"
import { Money } from "@/src/core/domain/payment/money"
import type { StatusView as View } from "@/src/core/use-cases/status/get-status-by-token"
import type { Application } from "@/src/core/domain/application/application"
import { aNewRegistrationApplication, anApplication } from "@/tests/fixtures/applications"
import type { OrderableService } from "@/src/core/domain/application/service"
import { StatusView } from "./status-view"

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

const order = anApplication({ status: "failed_correctable" })
const at5b = (correctable: boolean): View => ({
  service: "deregistration",
  reference: order.reference,
  status: order.status,
  licencePlate: order.request.licencePlate,
  plateCount: 2,
  vinEnding: "0001",
  steps: customerSteps(order),
  documents: [],
  correctable,
  cancellation: { returned: Money.ofCents(5000), retained: Money.ofCents(1999) },
})

const show = (view: View, servicesOnSale: readonly OrderableService[] = ["deregistration"]) =>
  render(<StatusView view={view} servicesOnSale={servicesOnSale} documentHref={() => "#"} cancelAction={jest.fn()} correctAction={jest.fn()} />)

describe("a 5b on the status page", () => {
  it("offers correcting and cancelling while the money is whole", () => {
    show(at5b(true))

    expect(screen.getByRole("button", { name: "Erneut einreichen" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Antrag stornieren" })).toBeInTheDocument()
  })

  it("offers only the cancel, and says why, once part of the money has gone back", () => {
    show(at5b(false))

    expect(screen.queryByRole("button", { name: "Erneut einreichen" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Antrag stornieren" })).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(/Stornierung/)
  })
})

const T0 = new Date("2026-03-01T09:00:00.000Z")
const STEPS = {
  waiting: ["submitted_and_paid", "awaiting_identity_verification"],
  mismatch: ["submitted_and_paid", "awaiting_identity_verification", "failed_correctable"],
  refusedByKba: ["submitted_and_paid", "awaiting_identity_verification", "identity_verified", "submitted_to_kba", "failed_correctable"],
  completed: ["submitted_and_paid", "awaiting_identity_verification", "identity_verified", "submitted_to_kba", "completed"],
  expired: ["submitted_and_paid", "awaiting_identity_verification", "cancelled"],
  cancelled: ["submitted_and_paid", "awaiting_identity_verification", "failed_correctable", "cancelled"],
} as const satisfies Record<string, readonly Application["status"][]>

/** A Neuzulassung's view, built from the history it would really have, so its steps are the ones the page gets. */
function newRegistrationView(path: keyof typeof STEPS, overrides: Partial<Extract<View, { service: "newRegistration" }>> = {}): View {
  const history = STEPS[path].map((status, index) => ({ status, at: new Date(T0.getTime() + index * 60_000) }))
  const order = aNewRegistrationApplication({ status: history.at(-1)!.status, history })
  return {
    service: "newRegistration",
    reference: order.reference,
    status: order.status,
    vinEnding: "0002",
    steps: customerSteps(order),
    documents: [],
    ...overrides,
  }
}

const cancellation = { returned: Money.ofCents(10901), retained: Money.ofCents(1999) }

describe("a Neuzulassung 5b on the status page", () => {
  it("offers the owner's name and birth date, the eVB and the Teil II, and the cancel, after a verification mismatch", () => {
    show(newRegistrationView("mismatch", { correctable: true, ownerCorrectable: true, cancellation }))

    for (const label of ["Vorname", "Nachname", "Geburtsdatum", /eVB-Nummer/, /Teil-II-Nummer/]) expect(screen.getByLabelText(label)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Korrektur absenden" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Antrag stornieren" })).toBeInTheDocument()
  })

  it("offers only the eVB and the Teil II once the order was verified and refused by the registration service", () => {
    show(newRegistrationView("refusedByKba", { correctable: true, ownerCorrectable: false, cancellation }))

    expect(screen.getByLabelText(/eVB-Nummer/)).toBeInTheDocument()
    expect(screen.queryByLabelText("Vorname")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Geburtsdatum")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Antrag stornieren" })).toBeInTheDocument()
  })

  it("does not offer the de-registration's form, whose plate codes a Neuzulassung does not have", () => {
    show(newRegistrationView("refusedByKba", { correctable: true, ownerCorrectable: false, cancellation }))

    expect(screen.queryByRole("button", { name: "Erneut einreichen" })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Sicherheitscode hinteres Kennzeichen/)).not.toBeInTheDocument()
  })

  it("offers only the cancel, and says why, once part of the money has gone back", () => {
    show(newRegistrationView("mismatch", { correctable: false, ownerCorrectable: true, cancellation }))

    expect(screen.queryByRole("button", { name: "Korrektur absenden" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Antrag stornieren" })).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(/Stornierung/)
  })
})

describe("a Neuzulassung waiting for the customer's identity check", () => {
  it("names the day and time the wait ends, in Berlin time, since that is when the order is cancelled", () => {
    show(newRegistrationView("waiting", { verificationDeadline: new Date("2026-03-05T09:00:00.000Z") }))

    expect(screen.getByText(/05\.03\.2026, 10:00/)).toBeInTheDocument()
  })

  it("explains the wait while it lasts, and no longer once the identity is confirmed", () => {
    const { unmount } = show(newRegistrationView("waiting", { verificationDeadline: new Date("2026-03-05T09:00:00.000Z") }))
    expect(screen.getByText(/Link dazu haben wir Ihnen per E-Mail geschickt/)).toBeInTheDocument()
    unmount()

    show(newRegistrationView("refusedByKba", { correctable: true, ownerCorrectable: false, cancellation }))
    expect(screen.queryByText(/Link dazu haben wir Ihnen per E-Mail geschickt/)).not.toBeInTheDocument()
  })

  it("says it is checking the corrected details, and names no deadline, once the customer has already verified", () => {
    const history = [...STEPS.mismatch, "awaiting_identity_verification"].map((status, index) => ({ status: status as Application["status"], at: new Date(T0.getTime() + index * 60_000) }))
    const order = aNewRegistrationApplication({ status: "awaiting_identity_verification", history })
    show({ ...newRegistrationView("waiting", { verificationDeadline: new Date("2026-03-05T09:00:00.000Z") }), steps: customerSteps(order) })

    expect(screen.getByText(/korrigierten Angaben/)).toBeInTheDocument()
    expect(screen.queryByText(/05\.03\.2026/)).not.toBeInTheDocument()
    expect(screen.queryByText(/stornieren wir den Auftrag/)).not.toBeInTheDocument()
  })

  it("offers neither a correction nor a cancel: nothing can be done here but verify", () => {
    show(newRegistrationView("waiting", { verificationDeadline: new Date("2026-03-05T09:00:00.000Z") }))

    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})

describe("a Neuzulassung that ended without a registration", () => {
  it("says the verification ran out when it did, not that the customer cancelled", () => {
    show(newRegistrationView("expired", { refund: cancellation }))

    expect(screen.getByText(/nicht rechtzeitig bestätigt/)).toBeInTheDocument()
    expect(screen.queryByText("Sie haben den Antrag storniert.")).not.toBeInTheDocument()
  })

  it("says the customer cancelled when they did", () => {
    show(newRegistrationView("cancelled", { refund: cancellation }))

    expect(screen.getByText("Sie haben den Antrag storniert.")).toBeInTheDocument()
    expect(screen.queryByText(/nicht rechtzeitig bestätigt/)).not.toBeInTheDocument()
  })

  it("never sends the customer to another service's funnel to try again", () => {
    show(newRegistrationView("cancelled", { refund: cancellation }))

    for (const link of screen.getAllByRole("link")) expect(link).not.toHaveAttribute("href", "/deregister")
  })

  it("sends a Neuzulassung back to its own funnel once the service is on sale", () => {
    show(newRegistrationView("cancelled", { refund: cancellation }), ["deregistration", "newRegistration"])

    expect(screen.getByRole("link", { name: "Neuen Antrag stellen" })).toHaveAttribute("href", "/register")
  })

  it("still sends a de-registration back to its own funnel", () => {
    const cancelled = anApplication({ status: "cancelled", history: [{ status: "cancelled", at: T0 }] })
    show({ ...at5b(false), status: "cancelled", steps: customerSteps(cancelled), cancellation: undefined })

    expect(screen.getByRole("link", { name: "Neuen Antrag stellen" })).toHaveAttribute("href", "/deregister")
  })
})

describe("a completed Neuzulassung", () => {
  const documents = [
    { id: "1", kind: "confirmation" },
    { id: "2", kind: "temporaryCertificate" },
  ] as const

  it("offers each document under its own name, behind the link the page was given", () => {
    render(<StatusView view={newRegistrationView("completed", { documents })} servicesOnSale={["deregistration"]} documentHref={(id) => `/doc/${id}`} cancelAction={jest.fn()} correctAction={jest.fn()} />)

    expect(screen.getByRole("link", { name: /Vorläufiger Zulassungsnachweis/ })).toHaveAttribute("href", "/doc/2")
    expect(screen.getByRole("link", { name: /Bestätigung der Zulassung/ })).toHaveAttribute("href", "/doc/1")
    expect(screen.queryByText(/Abmeldung/)).not.toBeInTheDocument()
  })

  it("says what arrives by post and what to do next, which a completed de-registration has nothing of", () => {
    const { unmount } = show(newRegistrationView("completed", { documents }))
    expect(screen.getByRole("heading", { name: "Wie geht es weiter?" })).toBeInTheDocument()
    unmount()

    const completed = anApplication({ status: "completed", history: [{ status: "completed", at: T0 }] })
    show({ ...at5b(false), status: "completed", steps: customerSteps(completed), cancellation: undefined })
    expect(screen.queryByRole("heading", { name: "Wie geht es weiter?" })).not.toBeInTheDocument()
  })
})
