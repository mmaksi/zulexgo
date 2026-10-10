import { render, screen } from "@testing-library/react"
import { BetaGate } from "./beta-gate"

const mockContainer: { beta?: { invites: Record<string, string[]>; dailyPlaces: number } } = {}
let mockHeld: string | undefined

jest.mock("@/src/config/container", () => ({ getContainer: () => mockContainer }))
jest.mock("./invite-cookie", () => ({ heldInvite: async () => mockHeld }))
jest.mock("./redeem-invite-action", () => ({ redeemInviteAction: async () => ({ status: "refused" }) }))
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

const show = async () => render(await BetaGate({ service: "newRegistration", name: "Neuzulassung", children: <p>Der Antrag</p> }))

describe("the gate in front of a funnel", () => {
  beforeEach(() => {
    mockContainer.beta = { invites: { newRegistration: ["K7M2-QX9P"] }, dailyPlaces: 5 }
    mockHeld = undefined
  })

  it("shows the funnel to everyone while the service is not in beta", async () => {
    mockContainer.beta = undefined

    await show()

    expect(screen.getByText("Der Antrag")).toBeInTheDocument()
  })

  it("asks a browser without a code for one, and shows no funnel", async () => {
    await show()

    expect(screen.getByLabelText("Einladungscode")).toBeInTheDocument()
    expect(screen.queryByText("Der Antrag")).not.toBeInTheDocument()
  })

  it("shows the funnel to a browser holding a code of the service", async () => {
    mockHeld = "K7M2-QX9P"

    await show()

    expect(screen.getByText("Der Antrag")).toBeInTheDocument()
  })

  it("asks again when the code a browser holds is no longer one, say because it was revoked", async () => {
    mockHeld = "REVOKED-0001"

    await show()

    expect(screen.getByLabelText("Einladungscode")).toBeInTheDocument()
    expect(screen.queryByText("Der Antrag")).not.toBeInTheDocument()
  })
})
