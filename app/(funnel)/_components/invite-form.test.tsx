import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { InviteAnswer } from "./invite-form"
import { InviteForm } from "./invite-form"

const refresh = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

function setup(answer: InviteAnswer) {
  const action = jest.fn(async () => answer)
  const user = userEvent.setup()
  render(<InviteForm service="Neuzulassung" action={action} />)
  return { action, user }
}

const redeem = async (user: ReturnType<typeof userEvent.setup>, code: string) => {
  if (code) await user.type(screen.getByLabelText("Einladungscode"), code)
  await user.click(screen.getByRole("button", { name: "Weiter" }))
}

describe("InviteForm", () => {
  beforeEach(() => refresh.mockClear())

  it("sends the code as typed and, once it is accepted, asks the page to load again, now with the funnel", async () => {
    const { action, user } = setup({ status: "accepted" })

    await redeem(user, "k7m2-qx9p")

    expect(action).toHaveBeenCalledWith("k7m2-qx9p")
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("puts a refused code's error at the field, described by it, and keeps what was typed", async () => {
    const { user } = setup({ status: "refused" })

    await redeem(user, "WRONG-CODE")

    const field = await screen.findByLabelText("Einladungscode")
    expect(field).toBeInvalid()
    expect(field).toHaveAccessibleDescription(expect.stringContaining("nicht gültig"))
    expect(field).toHaveValue("WRONG-CODE")
    expect(refresh).not.toHaveBeenCalled()
  })

  it("puts the cursor back in the field after a code that did not work, as a funnel does for its first invalid field", async () => {
    const { user } = setup({ status: "refused" })

    await redeem(user, "WRONG-CODE")

    await screen.findByText(/nicht gültig/)
    expect(screen.getByLabelText("Einladungscode")).toHaveFocus()
  })

  it("asks for a code instead of sending nothing", async () => {
    const { action, user } = setup({ status: "accepted" })

    await redeem(user, "")

    expect(await screen.findByLabelText("Einladungscode")).toHaveAccessibleDescription(expect.stringContaining("Bitte geben Sie"))
    expect(action).not.toHaveBeenCalled()
  })

  it("tells a caller who tried too often how long to wait", async () => {
    const { user } = setup({ status: "limited", retryAfterMinutes: 41 })

    await redeem(user, "WRONG-CODE")

    expect(await screen.findByRole("alert")).toHaveTextContent(/41 Minuten/)
  })

  it("says so when it cannot check, instead of calling the code wrong", async () => {
    const { user } = setup({ status: "unavailable" })

    await redeem(user, "K7M2-QX9P")

    expect(await screen.findByRole("alert")).toHaveTextContent(/nicht geklappt/)
    expect(screen.getByLabelText("Einladungscode")).not.toBeInvalid()
  })

  it("does not send twice while the first request is out", async () => {
    let finish!: (answer: InviteAnswer) => void
    const action = jest.fn(() => new Promise<InviteAnswer>((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    render(<InviteForm service="Neuzulassung" action={action} />)
    await user.type(screen.getByLabelText("Einladungscode"), "K7M2-QX9P")

    await user.click(screen.getByRole("button", { name: "Weiter" }))
    await user.click(screen.getByRole("button", { name: /Weiter|Wird geprüft/ }))

    expect(action).toHaveBeenCalledTimes(1)
    finish({ status: "refused" })
  })
})
