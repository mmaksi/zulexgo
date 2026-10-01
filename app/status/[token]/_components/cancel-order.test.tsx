import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { OrderChangeState } from "@/app/status/[token]/order-change-state"
import { CancelOrder } from "./cancel-order"

const refresh = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

function setup(answer: OrderChangeState = { status: "done" }) {
  const action = jest.fn(async () => answer)
  const user = userEvent.setup()
  render(<CancelOrder action={action} returned="50,00 €" retained="19,99 €" />)
  return { action, user }
}

const open = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Antrag stornieren" }))

beforeEach(() => refresh.mockClear())

describe("CancelOrder", () => {
  it("names what is kept and what comes back next to the button, before anything is asked", () => {
    const { action } = setup()

    expect(screen.getByText(/19,99 €/)).toBeInTheDocument()
    expect(screen.getByText(/50,00 €/)).toBeInTheDocument()
    expect(action).not.toHaveBeenCalled()
  })

  it("asks first, and cancels nothing until the customer confirms", async () => {
    const { action, user } = setup()

    await open(user)

    expect(await screen.findByRole("alertdialog")).toHaveTextContent(/19,99 €/)
    expect(action).not.toHaveBeenCalled()
  })

  it("leaves the order alone when the customer backs out", async () => {
    const { action, user } = setup()
    await open(user)

    await user.click(await screen.findByRole("button", { name: "Nicht stornieren" }))

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(action).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("cancels once however often the confirmation is pressed while it runs, then shows the new state of the page", async () => {
    let finish: (state: OrderChangeState) => void = () => {}
    const action = jest.fn(() => new Promise<OrderChangeState>((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    render(<CancelOrder action={action} returned="50,00 €" retained="19,99 €" />)
    await open(user)
    const confirm = await screen.findByRole("button", { name: "Jetzt stornieren" })

    await user.dblClick(confirm)
    await user.click(confirm)
    finish({ status: "done" })

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(action).toHaveBeenCalledTimes(1)
  })

  it("shows the page as it now stands when the order can no longer be cancelled", async () => {
    const { user } = setup({ status: "notPossible" })
    await open(user)

    await user.click(await screen.findByRole("button", { name: "Jetzt stornieren" }))

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })

  it("tells the customer to try again when it failed, and lets them", async () => {
    const { action, user } = setup({ status: "failed" })
    await open(user)
    await user.click(await screen.findByRole("button", { name: "Jetzt stornieren" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/nicht geklappt/)
    expect(refresh).not.toHaveBeenCalled()

    await open(user)
    await user.click(await screen.findByRole("button", { name: "Jetzt stornieren" }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2))
  })

  it("tells a caller who tried too often how long to wait", async () => {
    const { user } = setup({ status: "limited", retryAfterMinutes: 37 })
    await open(user)

    await user.click(await screen.findByRole("button", { name: "Jetzt stornieren" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/37 Minuten/)
  })

  it("reports a request that itself failed, since the server never answered", async () => {
    const action = jest.fn(async () => Promise.reject(new Error("network")))
    const user = userEvent.setup()
    render(<CancelOrder action={action} returned="50,00 €" retained="19,99 €" />)
    await open(user)

    await user.click(await screen.findByRole("button", { name: "Jetzt stornieren" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/nicht geklappt/)
  })
})
