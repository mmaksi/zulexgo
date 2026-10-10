import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderToStaticMarkup } from "react-dom/server"
import type { ResendFormState } from "@/app/status/link-anfordern/resend-form-state"
import { ResendLinkForm } from "./resend-link-form"

function setup(answer: ResendFormState) {
  const action = jest.fn(async () => answer)
  const user = userEvent.setup()
  render(<ResendLinkForm action={action} />)
  return { action, user }
}

const fill = async (user: ReturnType<typeof userEvent.setup>, reference: string, email: string) => {
  if (reference) await user.type(screen.getByLabelText("Auftragsnummer"), reference)
  if (email) await user.type(screen.getByLabelText("E-Mail-Adresse"), email)
  await user.click(screen.getByRole("button", { name: "Link senden" }))
}

describe("ResendLinkForm", () => {
  it("sends what was typed and confirms without saying whether the order exists", async () => {
    const { action, user } = setup({ status: "accepted" })

    await fill(user, "ZG-ABC123", "kunde@example.test")

    expect(action).toHaveBeenCalledWith({ reference: "ZG-ABC123", email: "kunde@example.test" })
    expect(await screen.findByRole("status")).toHaveTextContent(/Wenn Auftragsnummer und E-Mail-Adresse zusammenpassen/)
  })

  it("puts each error at its field, described by it, and keeps what was typed", async () => {
    const { user } = setup({ status: "invalid", errors: { reference: "Bitte geben Sie Ihre Auftragsnummer ein.", email: "Bitte geben Sie eine gültige E-Mail-Adresse ein." } })

    await fill(user, "ZG-1", "kunde")

    const reference = await screen.findByLabelText("Auftragsnummer")
    expect(reference).toBeInvalid()
    expect(reference).toHaveAccessibleDescription(expect.stringContaining("Bitte geben Sie Ihre Auftragsnummer ein."))
    expect(reference).toHaveValue("ZG-1")
    expect(screen.getByLabelText("E-Mail-Adresse")).toHaveAccessibleDescription(expect.stringContaining("gültige E-Mail-Adresse"))
  })

  it.each([
    ["the order number when both fields are wrong", { reference: "Bitte geben Sie Ihre Auftragsnummer ein.", email: "Bitte geben Sie eine gültige E-Mail-Adresse ein." }, "Auftragsnummer", "resend-reference-error"],
    ["the email address when only it is wrong", { email: "Bitte geben Sie eine gültige E-Mail-Adresse ein." }, "E-Mail-Adresse", "resend-email-error"],
  ])("moves focus to %s, with its error already described, so a screen reader hears it", async (_, errors, label, errorId) => {
    const { user } = setup({ status: "invalid", errors })
    const field = screen.getByLabelText(label)
    let describedOnFocus: string | null = null
    field.addEventListener("focus", () => (describedOnFocus = field.getAttribute("aria-describedby")))

    await fill(user, "ZG-1", "kunde")

    await waitFor(() => expect(field).toHaveFocus())
    expect(describedOnFocus).toContain(errorId)
  })

  it("tells a caller who asked too often how long to wait", async () => {
    const { user } = setup({ status: "limited", retryAfterMinutes: 41 })

    await fill(user, "ZG-ABC123", "kunde@example.test")

    expect(await screen.findByRole("alert")).toHaveTextContent(/41 Minuten/)
  })

  it("does not send twice while the first request is out", async () => {
    let finish!: (state: ResendFormState) => void
    const action = jest.fn(() => new Promise<ResendFormState>((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    render(<ResendLinkForm action={action} />)
    await user.type(screen.getByLabelText("Auftragsnummer"), "ZG-ABC123")
    await user.type(screen.getByLabelText("E-Mail-Adresse"), "kunde@example.test")

    await user.click(screen.getByRole("button", { name: "Link senden" }))
    await user.click(screen.getByRole("button", { name: /Link senden|Wird gesendet/ }))

    expect(action).toHaveBeenCalledTimes(1)
    finish({ status: "accepted" })
  })

  describe("before its script has run", () => {
    const html = () => renderToStaticMarkup(<ResendLinkForm action={jest.fn()} />)

    it("cannot be submitted, so the details are never sent by the browser's own submit", () => {
      expect(html()).toMatch(/<button[^>]*type="submit"[^>]*\sdisabled=""/)
    })

    it("would send the details in the body, never in the address, if it somehow were", () => {
      expect(html()).toMatch(/<form[^>]*method="post"/)
    })
  })
})
