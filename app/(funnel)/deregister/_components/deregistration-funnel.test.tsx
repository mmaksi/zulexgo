import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { PaymentMode } from "@/app/(funnel)/_components/payment-driver"
import type { CheckoutActions } from "./checkout-actions"
import { DeregistrationFunnel } from "./deregistration-funnel"

function setup(overrides: Partial<CheckoutActions> = {}, payment: PaymentMode = { kind: "simulated" }) {
  const actions: CheckoutActions = {
    checkEligibility: jest.fn(async (prefix: string) => ({ ok: true as const, prefix, ikfzStatus: "online" as const })),
    startCheckout: jest.fn(async () => ({ ok: true as const, reference: "ZG-ABC123", clientSecret: "fake-secret" })),
    completeSimulatedPayment: jest.fn(async () => ({ ok: true })),
    ...overrides,
  }
  const user = userEvent.setup()
  const followLink = jest.fn((event: { preventDefault: () => void }) => event.preventDefault())
  render(
    <>
      <a href="/impressum" onClick={followLink}>
        Impressum
      </a>
      <DeregistrationFunnel payment={payment} actions={actions} />
    </>,
  )
  return { actions, user, followLink }
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
    it("lets the customer retry when the eligibility request rejects", async () => {
      const checkEligibility = jest.fn().mockRejectedValueOnce(new Error("Network lost"))
        .mockResolvedValueOnce({ ok: true, prefix: "AAA", ikfzStatus: "online" })
      const { user } = setup({ checkEligibility })

      await passEligibility(user)

      expect(await screen.findByText(/gerade nicht zu erreichen/)).toBeInTheDocument()
      await user.click(screen.getByRole("button", { name: "Weiter" }))
      expect(await screen.findByRole("heading", { name: "Ihr Fahrzeug" })).toBeInTheDocument()
    })

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

    it.each([
      ["no authority answers", jest.fn(async () => ({ ok: false as const, reason: "invalidPrefix" as const }))],
      ["the request rejects", jest.fn(async () => Promise.reject(new Error("Network lost")))],
    ])("moves focus to the prefix when %s, with the error already described, so a screen reader hears it", async (_, checkEligibility) => {
      const { user } = setup({ checkEligibility })
      const prefix = screen.getByLabelText("Ortskürzel Ihres Kennzeichens")
      let describedOnFocus: string | null = null
      prefix.addEventListener("focus", () => (describedOnFocus = prefix.getAttribute("aria-describedby")))

      await passEligibility(user)

      expect(prefix).toHaveFocus()
      expect(describedOnFocus).toContain("eligibility-prefix-error")
    })

    it("tells the customer how long to wait when their address asked too often, and keeps them on the step", async () => {
      const { user } = setup({ checkEligibility: jest.fn(async () => ({ ok: false as const, reason: "limited" as const, retryAfterMinutes: 42 })) })

      await passEligibility(user)

      expect(screen.getByLabelText("Ortskürzel Ihres Kennzeichens")).toHaveAccessibleDescription(/42 Minuten/)
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Können Sie online abmelden?")
    })

    describe("J11, a special plate", () => {
      const special = () => screen.getByRole("checkbox", { name: /E-, H- oder Saisonkennzeichen/ })

      it("says the application may be rejected once the customer names such a plate, and says nothing before", async () => {
        const { user } = setup()
        expect(screen.queryByText(/abgelehnt werden/)).not.toBeInTheDocument()

        await user.click(special())

        expect(screen.getByRole("status")).toHaveTextContent(/abgelehnt werden/)
        await user.click(special())
        expect(screen.queryByText(/abgelehnt werden/)).not.toBeInTheDocument()
      })

      it("does not stop the customer: it is a warning, not a gate", async () => {
        const { user, actions } = setup()
        await user.click(screen.getByRole("radio", { name: /^Zwei Kennzeichen/ }))
        await user.click(screen.getByRole("radio", { name: "Ja, beides liegt mir vor" }))
        await user.type(screen.getByLabelText("Ortskürzel Ihres Kennzeichens"), "AAA")
        await user.click(special())

        await user.click(screen.getByRole("button", { name: "Weiter" }))

        expect(actions.checkEligibility).toHaveBeenCalledWith("AAA")
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ihr Fahrzeug")
      })
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

    it("moves focus to the first invalid field with its error already described, so a screen reader hears it", async () => {
      const { user } = setup()
      await passEligibility(user)
      const prefix = screen.getByLabelText("Ortskürzel")
      await user.clear(prefix)
      let describedOnFocus: string | null = null
      prefix.addEventListener("focus", () => (describedOnFocus = prefix.getAttribute("aria-describedby")))

      await user.click(screen.getByRole("button", { name: "Weiter" }))

      expect(prefix).toHaveFocus()
      expect(describedOnFocus).toContain("vehicle-prefix-error")
    })

    it("warns, without blocking, when a VIN is shorter than the modern 17 characters", async () => {
      const { user } = setup()
      await passEligibility(user)

      await user.type(screen.getByLabelText("Fahrzeug-Identifizierungsnummer (FIN)"), "OLD123")

      expect(screen.getByLabelText("Fahrzeug-Identifizierungsnummer (FIN)")).toHaveAccessibleDescription(/17 Stellen/)
    })
  })

  describe("leaving the funnel", () => {
    it("lets a customer leave freely before anything is entered", async () => {
      const { user, followLink } = setup()

      await user.click(screen.getByRole("link", { name: "Impressum" }))

      expect(followLink).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    })

    it("asks before a link away from the funnel throws away what was entered, and stays on request", async () => {
      const { user, followLink } = setup()
      await passEligibility(user)

      await user.click(screen.getByRole("link", { name: "Impressum" }))

      expect(followLink).not.toHaveBeenCalled()
      await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Bleiben" }))
      expect(screen.getByRole("heading", { level: 1, name: "Ihr Fahrzeug" })).toBeInTheDocument()
      expect(followLink).not.toHaveBeenCalled()
    })

    it("follows the link once the customer confirms leaving", async () => {
      const { user, followLink } = setup()
      await passEligibility(user)

      await user.click(screen.getByRole("link", { name: "Impressum" }))
      await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Verlassen" }))

      expect(followLink).toHaveBeenCalledTimes(1)
    })
  })

  describe("review and payment", () => {
    it.each(["startCheckout", "completeSimulatedPayment"] as const)("lets the customer retry when %s rejects", async (operation) => {
      const rejectOnce = jest.fn().mockRejectedValueOnce(new Error("Network lost"))
        .mockResolvedValueOnce(operation === "startCheckout"
          ? { ok: true, reference: "ZG-ABC123", clientSecret: "fake-secret" }
          : { ok: true })
      const { user, actions } = setup({ [operation]: rejectOnce })
      await passEligibility(user)
      await fillVehicle(user)
      await user.click(consentBoxes()[0])
      await user.click(consentBoxes()[1])

      await user.click(payButton())

      expect(await screen.findByRole("alert")).toHaveTextContent(/versuchen Sie es/)
      expect(payButton()).toBeEnabled()
      await user.click(payButton())
      expect(await screen.findByText("ZG-ABC123")).toBeInTheDocument()
      if (operation === "completeSimulatedPayment") expect(actions.startCheckout).toHaveBeenCalledTimes(1)
    })

    it("shows the processing fee and keeps payment impossible until both consents are given", async () => {
      const { user } = setup()
      await passEligibility(user)
      await fillVehicle(user)

      const notice = screen.getByText(/behalten wir 19,99\s€ Bearbeitungsgebühr ein/)
      expect(notice).toHaveTextContent(/erstatten den Rest innerhalb von 3–5 Werktagen/)
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

      expect(await screen.findByLabelText("Fahrzeug-Identifizierungsnummer (FIN)")).toHaveValue("FAKEVIN0000000001")
      expect(screen.getByLabelText("Sicherheitscode Fahrzeugschein")).toHaveValue("AAAAAA1")
      await user.click(screen.getByRole("button", { name: "Zurück" }))
      expect(await screen.findByRole("radio", { name: /^Zwei Kennzeichen/ })).toBeChecked()
    })

    it("goes back one step with the browser's back button, keeping what was entered", async () => {
      const { user } = setup()
      await passEligibility(user)
      await fillVehicle(user)

      act(() => window.history.back())

      expect(await screen.findByRole("heading", { level: 1, name: "Ihr Fahrzeug" })).toBeInTheDocument()
      expect(screen.getByLabelText("Sicherheitscode Fahrzeugschein")).toHaveValue("AAAAAA1")
    })

    it("stays on the confirmation when the browser goes back after paying, so nothing is paid twice", async () => {
      const { user } = setup()
      await passEligibility(user)
      await fillVehicle(user)
      await user.click(consentBoxes()[0])
      await user.click(consentBoxes()[1])
      await user.click(payButton())
      await screen.findByText("ZG-ABC123")

      await act(async () => {
        window.history.back()
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      expect(screen.getByText("ZG-ABC123")).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Jetzt bezahlen" })).not.toBeInTheDocument()
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

    describe("J8, a vehicle that already has an open order", () => {
      const startCheckout = () =>
        jest
          .fn<ReturnType<CheckoutActions["startCheckout"]>, Parameters<CheckoutActions["startCheckout"]>>()
          .mockResolvedValueOnce({ ok: false, reason: "duplicate" })
          .mockResolvedValueOnce({ ok: true, reference: "ZG-ABC123", clientSecret: "fake-secret" })

      async function reachDuplicateWarning() {
        const flow = setup({ startCheckout: startCheckout() })
        await passEligibility(flow.user)
        await fillVehicle(flow.user)
        await flow.user.click(consentBoxes()[0])
        await flow.user.click(consentBoxes()[1])
        await flow.user.click(payButton())
        return flow
      }

      it("warns that an order is already open, and takes no payment until the customer says they want another", async () => {
        const { user, actions } = await reachDuplicateWarning()

        expect(await screen.findByRole("alert")).toHaveTextContent(/bereits ein Antrag/)
        expect(actions.completeSimulatedPayment).not.toHaveBeenCalled()
        expect(payButton()).toBeDisabled()

        await user.click(screen.getByRole("checkbox", { name: /trotzdem einen weiteren Antrag/ }))

        expect(payButton()).toBeEnabled()
      })

      it("goes ahead, telling the server the customer confirmed, once they do", async () => {
        const { user, actions } = await reachDuplicateWarning()
        await user.click(await screen.findByRole("checkbox", { name: /trotzdem einen weiteren Antrag/ }))

        await user.click(payButton())

        expect(actions.startCheckout).toHaveBeenLastCalledWith(expect.objectContaining({ acknowledgedDuplicate: true }))
        expect(await screen.findByText("ZG-ABC123")).toBeInTheDocument()
      })

      it("does not ask when there is no other order", async () => {
        const { user } = setup()
        await passEligibility(user)
        await fillVehicle(user)

        expect(screen.queryByRole("checkbox", { name: /trotzdem einen weiteren Antrag/ })).not.toBeInTheDocument()
      })
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

    async function failFirstPaymentThenGoBack(overrides: Partial<CheckoutActions> = {}) {
      const completeSimulatedPayment = jest.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true })
      const flow = setup({ completeSimulatedPayment, ...overrides })
      await passEligibility(flow.user)
      await fillVehicle(flow.user)
      await flow.user.click(consentBoxes()[0])
      await flow.user.click(consentBoxes()[1])
      await flow.user.click(payButton())
      expect(await screen.findByRole("alert")).toHaveTextContent(/fehlgeschlagen/)
      await flow.user.click(screen.getByRole("button", { name: "Zurück" }))
      await screen.findByRole("heading", { level: 1, name: "Ihr Fahrzeug" })
      return flow
    }

    async function payAgain(user: User) {
      await user.click(screen.getByRole("button", { name: "Weiter" }))
      await user.click(consentBoxes()[0])
      await user.click(consentBoxes()[1])
      await user.click(payButton())
    }

    it("retries a failed payment on the same order after the customer went back and changed nothing", async () => {
      const { user, actions } = await failFirstPaymentThenGoBack()

      await payAgain(user)

      expect(await screen.findByText("ZG-ABC123")).toBeInTheDocument()
      expect(actions.startCheckout).toHaveBeenCalledTimes(1)
    })

    it("opens a new order once the customer changed what the first one holds", async () => {
      const startCheckout = jest
        .fn()
        .mockResolvedValueOnce({ ok: true, reference: "ZG-ABC123", clientSecret: "fake-secret" })
        .mockResolvedValueOnce({ ok: true, reference: "ZG-DEF456", clientSecret: "fake-secret-2" })
      const { user, actions } = await failFirstPaymentThenGoBack({ startCheckout })
      await user.clear(screen.getByLabelText("E-Mail-Adresse"))
      await user.type(screen.getByLabelText("E-Mail-Adresse"), "other@example.test")

      await payAgain(user)

      expect(await screen.findByText("ZG-DEF456")).toBeInTheDocument()
      expect(actions.startCheckout).toHaveBeenLastCalledWith(expect.objectContaining({ vehicle: expect.objectContaining({ email: "other@example.test" }) }))
    })

    it("tells the customer when the card form never loaded, instead of ignoring the click", async () => {
      // jsdom loads no external script, so Stripe.js never arrives: as with a blocker or a dropped connection.
      const { user, actions } = setup({}, { kind: "stripe", publishableKey: "pk_test_fake" })
      await passEligibility(user)
      await fillVehicle(user)
      await user.click(consentBoxes()[0])
      await user.click(consentBoxes()[1])

      await user.click(payButton())

      expect(await screen.findByRole("alert")).toHaveTextContent(/Zahlungsformular/)
      expect(actions.startCheckout).not.toHaveBeenCalled()
    })

    it("keeps the customer on the payment while it runs, and lets them go back once it failed", async () => {
      let finish!: (result: { ok: boolean }) => void
      const completeSimulatedPayment = jest.fn(() => new Promise<{ ok: boolean }>((resolve) => (finish = resolve)))
      const { user } = setup({ completeSimulatedPayment })
      await passEligibility(user)
      await fillVehicle(user)
      await user.click(consentBoxes()[0])
      await user.click(consentBoxes()[1])
      await user.click(payButton())

      expect(screen.getByRole("button", { name: "Zurück" })).toBeDisabled()
      await act(async () => {
        const popped = new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true }))
        window.history.back()
        await popped
      })
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Prüfen und bezahlen")

      await act(async () => finish({ ok: false }))
      await user.click(screen.getByRole("button", { name: "Zurück" }))
      expect(await screen.findByRole("heading", { level: 1, name: "Ihr Fahrzeug" })).toBeInTheDocument()
    })
  })
})
