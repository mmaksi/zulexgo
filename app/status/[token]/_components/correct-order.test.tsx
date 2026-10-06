import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderToStaticMarkup } from "react-dom/server"
import type { OrderChangeState } from "@/app/status/[token]/order-change-state"
import { CorrectOrder } from "./correct-order"

const refresh = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

function setup(answer: OrderChangeState = { status: "done" }, plateCount: 1 | 2 = 2) {
  const action = jest.fn<Promise<OrderChangeState>, [unknown]>(async () => answer)
  const user = userEvent.setup()
  render(<CorrectOrder action={action} plateCount={plateCount} />)
  return { action, user }
}

const field = (name: string | RegExp) => screen.getByLabelText(name)
const submit = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Erneut einreichen" }))

beforeEach(() => refresh.mockClear())

describe("CorrectOrder", () => {
  it("asks for the front plate's code only when the vehicle has a front plate", () => {
    const { unmount } = render(<CorrectOrder action={jest.fn()} plateCount={2} />)
    expect(screen.getByLabelText(/vorderes Kennzeichen/)).toBeInTheDocument()
    unmount()

    render(<CorrectOrder action={jest.fn()} plateCount={1} />)
    expect(screen.queryByLabelText(/vorderes Kennzeichen/)).not.toBeInTheDocument()
  })

  it("starts empty: a stored security code is never put back on the page", () => {
    setup()

    for (const input of screen.getAllByRole("textbox")) expect(input).toHaveValue("")
    expect(field(/Fahrzeugschein/)).toHaveValue("")
  })

  it("sends only what was filled in, tidied like the funnel tidies it", async () => {
    const { action, user } = setup()

    await user.type(field(/Fahrzeug-Identifizierungsnummer/), "fakevin0000000009")
    await user.type(field(/Fahrzeugschein/), "aaaaaa9")
    await submit(user)

    expect(action).toHaveBeenCalledWith({ vin: "FAKEVIN0000000009", rearPlate: "", frontPlate: "", certificate: "AAAAAA9" })
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })

  it("asks for at least one change instead of sending an empty correction", async () => {
    const { action, user } = setup()

    await submit(user)

    expect(await screen.findByRole("alert")).toHaveTextContent(/mindestens eine Angabe/)
    expect(action).not.toHaveBeenCalled()
  })

  it("puts the funnel's wording at a field that is wrong, described by it, focuses it, and does not send", async () => {
    const { action, user } = setup()
    await user.type(field(/hinteres Kennzeichen/), "AB")

    await submit(user)

    const rear = field(/hinteres Kennzeichen/)
    expect(rear).toBeInvalid()
    expect(rear).toHaveAccessibleDescription(expect.stringContaining("3-stelligen Code"))
    expect(rear).toHaveFocus()
    expect(action).not.toHaveBeenCalled()
  })

  it("shows the server's word on a field it found wrong, and keeps what was typed", async () => {
    const { user } = setup({ status: "invalid", errors: { vin: "Prüfen Sie die FIN." } })
    await user.type(field(/Fahrzeug-Identifizierungsnummer/), "FAKEVIN0000000009")

    await submit(user)

    const vin = await screen.findByLabelText(/Fahrzeug-Identifizierungsnummer/)
    await waitFor(() => expect(vin).toHaveAccessibleDescription(expect.stringContaining("Prüfen Sie die FIN.")))
    expect(vin).toHaveValue("FAKEVIN0000000009")
  })

  it("sends once however often submit is pressed while it runs", async () => {
    let finish: (state: OrderChangeState) => void = () => {}
    const action = jest.fn(() => new Promise<OrderChangeState>((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    render(<CorrectOrder action={action} plateCount={2} />)
    await user.type(field(/Fahrzeugschein/), "AAAAAA9")

    const button = screen.getByRole("button", { name: "Erneut einreichen" })
    await user.dblClick(button)
    await user.click(screen.getByRole("button", { name: /wird gesendet/i }))
    finish({ status: "done" })

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(action).toHaveBeenCalledTimes(1)
  })

  it.each([
    [{ status: "refused" } as const, /nicht angenommen/],
    [{ status: "unavailable" } as const, /nicht erreichbar/],
    [{ status: "failed" } as const, /nicht geklappt/],
    [{ status: "limited", retryAfterMinutes: 42 } as const, /42 Minuten/],
  ])("tells the customer %o, and leaves what they typed", async (answer, message) => {
    const { user } = setup(answer)
    await user.type(field(/Fahrzeugschein/), "AAAAAA9")

    await submit(user)

    expect(await screen.findByRole("alert")).toHaveTextContent(message)
    expect(refresh).not.toHaveBeenCalled()
    expect(field(/Fahrzeugschein/)).toHaveValue("AAAAAA9")
  })

  it("shows the page as it now stands when the order can no longer be corrected", async () => {
    const { user } = setup({ status: "notPossible" })
    await user.type(field(/Fahrzeugschein/), "AAAAAA9")

    await submit(user)

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })

  it("reports a request that itself failed", async () => {
    const action = jest.fn(async () => Promise.reject(new Error("network")))
    const user = userEvent.setup()
    render(<CorrectOrder action={action} plateCount={2} />)
    await user.type(field(/Fahrzeugschein/), "AAAAAA9")

    await submit(user)

    expect(await screen.findByRole("alert")).toHaveTextContent(/nicht geklappt/)
  })

  /**
   * The form is on screen before its script has run, and for good where the script is blocked or fails.
   * A native submit then sends every field as a query string: the security codes would end up in the
   * status page's address, the history and the server's logs.
   */
  describe("before its script has run", () => {
    const html = () => renderToStaticMarkup(<CorrectOrder action={jest.fn()} plateCount={2} />)

    it("cannot be submitted, so the codes are never sent by the browser's own submit", () => {
      expect(html()).toMatch(/<button[^>]*type="submit"[^>]*\sdisabled=""/)
    })

    it("would send the codes in the body, never in the address, if it somehow were", () => {
      expect(html()).toMatch(/<form[^>]*method="post"/)
    })
  })
})
