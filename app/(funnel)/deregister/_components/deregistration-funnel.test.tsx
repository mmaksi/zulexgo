import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { CheckoutActions } from "./checkout-actions"
import { DeregistrationFunnel } from "./deregistration-funnel"

function setup(overrides: Partial<CheckoutActions> = {}) {
  const actions: CheckoutActions = {
    checkEligibility: jest.fn(async (prefix: string) => ({ ok: true as const, prefix, ikfzStatus: "online" as const })),
    startCheckout: jest.fn(async () => ({ ok: true as const, reference: "ZG-ABC123", clientSecret: "fake-secret" })),
    completeSimulatedPayment: jest.fn(async () => ({ ok: true })),
    ...overrides,
  }
  const user = userEvent.setup()
  render(<DeregistrationFunnel payment={{ kind: "simulated" }} actions={actions} />)
  return { actions, user }
}

type User = ReturnType<typeof userEvent.setup>

async function passEligibility(user: User, plates: "Zwei" | "Ein" = "Zwei") {
  await user.click(screen.getByRole("radio", { name: new RegExp(`^${plates} Kennzeichen`) }))
  await user.click(screen.getByRole("radio", { name: "Ja, beides liegt mir vor" }))
  await user.type(screen.getByLabelText("Ortskürzel Ihres Kennzeichens"), "aaa")
  await user.click(screen.getByRole("button", { name: "Weiter" }))
}

async function fillVehicle(user: User) {
  await user.type(screen.getByLabelText("Buchstaben"), "aa")
  await user.type(screen.getByLabelText("Ziffern"), "111")
  await user.type(screen.getByLabelText("Fahrzeug-Identifizierungsnummer (FIN)"), "fakevin0000000001")
  await user.type(screen.getByLabelText("Sicherheitscode hinteres Kennzeichen"), "aa1")
  if (screen.queryByLabelText("Sicherheitscode vorderes Kennzeichen")) {
    await user.type(screen.getByLabelText("Sicherheitscode vorderes Kennzeichen"), "aa2")
  }
  await user.type(screen.getByLabelText("Sicherheitscode Fahrzeugschein"), "aaaaaa1")
  await user.type(screen.getByLabelText("E-Mail-Adresse"), "customer@example.test")
  await user.click(screen.getByRole("button", { name: "Weiter" }))
}

const consentBoxes = () => screen.getAllByRole("checkbox")
const payButton = () => screen.getByRole("button", { name: "Jetzt bezahlen" })

describe("de-registration funnel", () => {
  describe("eligibility", () => {
    it("stops a customer without the documents before any effort", async () => {
      const { user } = setup()
      await user.click(screen.getByRole("radio", { name: /^Zwei Kennzeichen/ }))
      await user.click(screen.getByRole("radio", { name: "Nein" }))
      await user.type(screen.getByLabelText("Ortskürzel Ihres Kennzeichens"), "AAA")

      expect(screen.getByRole("status")).toHaveTextContent(/vor Ort abmelden/)
      expect(screen.getByRole("button", { name: "Weiter" })).toBeDisabled()
    })

    it("keeps the customer on the step when no authority answers for the prefix", async () => {
      const { user } = setup({ checkEligibility: jest.fn(async () => ({ ok: false as const, reason: "invalidPrefix" as const })) })

      await passEligibility(user)

      expect(screen.getByLabelText("Ortskürzel Ihres Kennzeichens")).toHaveAccessibleDescription(/keine Zulassungsstelle/)
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Können Sie online abmelden?")
    })

    it("warns before any data entry when the authority processes by hand", async () => {
      const { user } = setup({
        checkEligibility: jest.fn(async (prefix: string) => ({ ok: true as const, prefix, ikfzStatus: "offline" as const })),
      })

      await passEligibility(user)

      expect(screen.getByText(/einige Tage dauern/)).toBeInTheDocument()
    })
  })

  describe("vehicle data", () => {
    it("asks for the front plate code only on a two-plate vehicle", async () => {
      const { user } = setup()
      await passEligibility(user, "Ein")

      expect(screen.queryByLabelText("Sicherheitscode vorderes Kennzeichen")).not.toBeInTheDocument()

      await user.click(screen.getByRole("button", { name: "Zurück" }))
      await user.click(screen.getByRole("radio", { name: /^Zwei Kennzeichen/ }))
      await user.click(screen.getByRole("button", { name: "Weiter" }))

      expect(screen.getByLabelText("Sicherheitscode vorderes Kennzeichen")).toBeInTheDocument()
    })

    it("names every field and explains each invalid one, focusing the first", async () => {
      const { user } = setup()
      await passEligibility(user)
      await user.clear(screen.getByLabelText("Ortskürzel"))

      await user.click(screen.getByRole("button", { name: "Weiter" }))

      const invalid = screen.getAllByRole("textbox").concat(screen.getByLabelText("Sicherheitscode Fahrzeugschein"))
      for (const field of invalid) expect(field).toHaveAccessibleName()
      expect(screen.getByLabelText("Ortskürzel")).toHaveFocus()
      expect(screen.getByLabelText("Sicherheitscode hinteres Kennzeichen")).toHaveAccessibleDescription(/3-stelligen Code/)
      expect(screen.getByLabelText("E-Mail-Adresse")).toHaveAttribute("aria-invalid", "true")
    })

    it("warns, without blocking, when a VIN is shorter than the modern 17 characters", async () => {
      const { user } = setup()
      await passEligibility(user)

      await user.type(screen.getByLabelText("Fahrzeug-Identifizierungsnummer (FIN)"), "OLD123")

      expect(screen.getByLabelText("Fahrzeug-Identifizierungsnummer (FIN)")).toHaveAccessibleDescription(/17 Stellen/)
    })
  })

  describe("review and payment", () => {
    it("shows the processing fee and keeps payment impossible until both consents are given", async () => {
      const { user } = setup()
      await passEligibility(user)
      await fillVehicle(user)

      expect(screen.getByText(/behalten wir 19,99\s€ Bearbeitungsgebühr ein/)).toBeInTheDocument()
      expect(payButton()).toBeDisabled()

      await user.click(consentBoxes()[0])
      expect(payButton()).toBeDisabled()

      await user.click(consentBoxes()[1])
      expect(payButton()).toBeEnabled()
    })

    it("never shows the security codes in the summary", async () => {
      const { user } = setup()
      await passEligibility(user)
      await fillVehicle(user)

      const summary = screen.getByRole("region", { name: "Ihre Angaben" })
      for (const code of ["AA1", "AA2", "AAAAAA1"]) expect(within(summary).queryByText(new RegExp(code))).not.toBeInTheDocument()
    })

    it("keeps everything entered when going back from the review", async () => {
      const { user } = setup()
      await passEligibility(user)
      await fillVehicle(user)

      await user.click(screen.getByRole("button", { name: "Zurück" }))

      expect(screen.getByLabelText("Fahrzeug-Identifizierungsnummer (FIN)")).toHaveValue("FAKEVIN0000000001")
      expect(screen.getByLabelText("Sicherheitscode Fahrzeugschein")).toHaveValue("AAAAAA1")
      await user.click(screen.getByRole("button", { name: "Zurück" }))
      expect(screen.getByRole("radio", { name: /^Zwei Kennzeichen/ })).toBeChecked()
    })

    it("pays, then confirms with the order ID and where the status link went", async () => {
      const { user, actions } = setup()
      await passEligibility(user)
      await fillVehicle(user)
      await user.click(consentBoxes()[0])
      await user.click(consentBoxes()[1])

      await user.click(payButton())

      expect(actions.startCheckout).toHaveBeenCalledWith({
        plateCount: 2,
        vehicle: expect.objectContaining({ prefix: "AAA", vin: "FAKEVIN0000000001", rearPlate: "AA1", email: "customer@example.test" }),
        consents: { terms: true, earlyStart: true },
      })
      expect(actions.completeSimulatedPayment).toHaveBeenCalledWith("ZG-ABC123")
      expect(await screen.findByText("ZG-ABC123")).toBeInTheDocument()
      expect(screen.getByText("customer@example.test")).toBeInTheDocument()
    })

    it("retries a failed payment on the same order instead of opening a second one", async () => {
      const completeSimulatedPayment = jest.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true })
      const { user, actions } = setup({ completeSimulatedPayment })
      await passEligibility(user)
      await fillVehicle(user)
      await user.click(consentBoxes()[0])
      await user.click(consentBoxes()[1])

      await user.click(payButton())
      expect(await screen.findByRole("alert")).toHaveTextContent(/fehlgeschlagen/)
      await user.click(payButton())

      expect(await screen.findByText("ZG-ABC123")).toBeInTheDocument()
      expect(actions.startCheckout).toHaveBeenCalledTimes(1)
    })
  })
})
