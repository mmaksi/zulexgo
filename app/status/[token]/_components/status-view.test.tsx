import { render, screen } from "@testing-library/react"
import { customerSteps } from "@/src/core/domain/application/customer-steps"
import { Money } from "@/src/core/domain/payment/money"
import type { StatusView as View } from "@/src/core/use-cases/status/get-status-by-token"
import { aNewRegistrationApplication, anApplication } from "@/tests/fixtures/applications"
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

const show = (view: View) =>
  render(<StatusView view={view} documentHref={() => "#"} cancelAction={jest.fn()} correctAction={jest.fn()} />)

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

describe("a Neuzulassung 5b on the status page", () => {
  const newRegistration = aNewRegistrationApplication({ status: "failed_correctable" })
  const view: View = {
    service: "newRegistration",
    reference: newRegistration.reference,
    status: newRegistration.status,
    vinEnding: "0002",
    steps: customerSteps(newRegistration),
    documents: [],
    cancellation: { returned: Money.ofCents(10901), retained: Money.ofCents(1999) },
  }

  // The de-registration form asks for plate codes a Neuzulassung does not have; its own form arrives with its status page.
  it("offers the cancel, but not the de-registration's correction form", () => {
    show(view)

    expect(screen.queryByRole("button", { name: "Erneut einreichen" })).not.toBeInTheDocument()
    expect(screen.queryByText("Angaben korrigieren")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Antrag stornieren" })).toBeInTheDocument()
  })
})
