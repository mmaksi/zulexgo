import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderToStaticMarkup } from "react-dom/server"
import type { OrderChangeState } from "@/app/status/[token]/order-change-state"
import { CorrectNewRegistration } from "./correct-new-registration"

const refresh = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

function setup(answer: OrderChangeState = { status: "done" }, ownerCorrectable = false) {
  const action = jest.fn<Promise<OrderChangeState>, [unknown]>(async () => answer)
  const user = userEvent.setup()
  render(<CorrectNewRegistration action={action} ownerCorrectable={ownerCorrectable} />)
  return { action, user }
}

const field = (name: string | RegExp) => screen.getByLabelText(name)
const submit = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Korrektur absenden" }))

beforeEach(() => refresh.mockClear())

describe("CorrectNewRegistration", () => {
  it("asks for the eVB number and the Teil II, which Zulex can still patch once the application is filed", () => {
    setup()

    expect(field(/eVB-Nummer/)).toBeInTheDocument()
    expect(field(/Teil-II-Nummer/)).toBeInTheDocument()
    expect(field(/Teil-II-Sicherheitscode/)).toBeInTheDocument()
  })

  it("asks for the owner's name and birth date only while the identity was never verified", () => {
    const { unmount } = render(<CorrectNewRegistration action={jest.fn()} ownerCorrectable />)
    expect(screen.getByLabelText("Vorname")).toBeInTheDocument()
    expect(screen.getByLabelText("Nachname")).toBeInTheDocument()
    expect(screen.getByLabelText("Geburtsdatum")).toBeInTheDocument()
    unmount()

    render(<CorrectNewRegistration action={jest.fn()} ownerCorrectable={false} />)
    for (const label of ["Vorname", "Nachname", "Geburtsdatum"]) expect(screen.queryByLabelText(label)).not.toBeInTheDocument()
  })

  it("starts empty: a stored code or name is never put back on the page", () => {
    setup(undefined, true)

    for (const input of screen.getAllByRole("textbox")) expect(input).toHaveValue("")
    expect(field(/Teil-II-Sicherheitscode/)).toHaveValue("")
    expect(field(/eVB-Nummer/)).toHaveValue("")
  })

  it("sends only what was filled in, the eVB number tidied like the funnel tidies it", async () => {
    const { action, user } = setup()

    await user.type(field(/eVB-Nummer/), "fakeevc")
    await user.type(field(/Teil-II-Sicherheitscode/), "NEWcode")
    await submit(user)

    expect(action).toHaveBeenCalledWith({
      evbNumber: "FAKEEVC",
      part2Number: "",
      part2SecurityCode: "NEWcode",
      firstName: "",
      lastName: "",
      birthDate: "",
    })
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })

  it("sends the corrected name and birth date when the owner can be corrected", async () => {
    const { action, user } = setup(undefined, true)

    await user.type(field("Vorname"), "Erik")
    await user.type(field("Geburtsdatum"), "1990-05-18")
    await submit(user)

    expect(action).toHaveBeenCalledWith(expect.objectContaining({ firstName: "Erik", lastName: "", birthDate: "1990-05-18", evbNumber: "" }))
  })

  it("asks for at least one change instead of sending an empty correction", async () => {
    const { action, user } = setup()

    await submit(user)

    expect(await screen.findByRole("alert")).toHaveTextContent(/mindestens eine Angabe/)
    expect(action).not.toHaveBeenCalled()
  })

  it("puts the funnel's wording at a field that is wrong, described by it, focuses it, and does not send", async () => {
    const { action, user } = setup()
    await user.type(field(/eVB-Nummer/), "FAKEEVI")
    await user.type(field(/Teil-II-Sicherheitscode/), "NEWCODE")

    await submit(user)

    const evb = field(/eVB-Nummer/)
    expect(evb).toBeInvalid()
    expect(evb).toHaveAccessibleDescription(expect.stringContaining("ohne I und O"))
    expect(evb).toHaveFocus()
    expect(field(/Teil-II-Sicherheitscode/)).not.toBeInvalid()
    expect(action).not.toHaveBeenCalled()
  })

  it("refuses a birth date under 18 before sending", async () => {
    const { action, user } = setup(undefined, true)
    await user.type(field("Geburtsdatum"), "2020-01-01")

    await submit(user)

    expect(field("Geburtsdatum")).toBeInvalid()
    expect(action).not.toHaveBeenCalled()
  })

  it("shows the server's word on a field it found wrong, and keeps what was typed", async () => {
    const { user } = setup({ status: "invalid", errors: { part2Number: "Prüfen Sie die Nummer." } })
    await user.type(field(/Teil-II-Nummer/), "FAKE0002")

    await submit(user)

    const number = await screen.findByLabelText(/Teil-II-Nummer/)
    await waitFor(() => expect(number).toHaveAccessibleDescription(expect.stringContaining("Prüfen Sie die Nummer.")))
    expect(number).toHaveValue("FAKE0002")
  })

  it("sends once however often submit is pressed while it runs", async () => {
    let finish: (state: OrderChangeState) => void = () => {}
    const action = jest.fn(() => new Promise<OrderChangeState>((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    render(<CorrectNewRegistration action={action} ownerCorrectable={false} />)
    await user.type(field(/Teil-II-Nummer/), "FAKE0002")

    await user.dblClick(screen.getByRole("button", { name: "Korrektur absenden" }))
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
    await user.type(field(/Teil-II-Nummer/), "FAKE0002")

    await submit(user)

    expect(await screen.findByRole("alert")).toHaveTextContent(message)
    expect(refresh).not.toHaveBeenCalled()
    expect(field(/Teil-II-Nummer/)).toHaveValue("FAKE0002")
  })

  it("says the name still does not match, not that the authority refused, when the order is checked again and fails", async () => {
    const { user } = setup({ status: "refused" }, true)
    await user.type(field("Nachname"), "Beispiel")

    await submit(user)

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(/Ausweis/)
    expect(alert).not.toHaveTextContent(/Zulassungsstelle/)
  })

  it("shows the page as it now stands when the order can no longer be corrected", async () => {
    const { user } = setup({ status: "notPossible" })
    await user.type(field(/Teil-II-Nummer/), "FAKE0002")

    await submit(user)

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })

  it("reports a request that itself failed", async () => {
    const action = jest.fn(async () => Promise.reject(new Error("network")))
    const user = userEvent.setup()
    render(<CorrectNewRegistration action={action} ownerCorrectable={false} />)
    await user.type(field(/Teil-II-Nummer/), "FAKE0002")

    await submit(user)

    expect(await screen.findByRole("alert")).toHaveTextContent(/nicht geklappt/)
  })

  describe("before its script has run", () => {
    const html = () => renderToStaticMarkup(<CorrectNewRegistration action={jest.fn()} ownerCorrectable />)

    it("cannot be submitted, so the codes are never sent by the browser's own submit", () => {
      expect(html()).toMatch(/<button[^>]*type="submit"[^>]*\sdisabled=""/)
    })

    it("would send the codes in the body, never in the address, if it somehow were", () => {
      expect(html()).toMatch(/<form[^>]*method="post"/)
    })
  })
})
