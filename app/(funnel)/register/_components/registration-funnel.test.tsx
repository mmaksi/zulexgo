import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { RegistrationActions } from "./registration-actions"
import { RegistrationFunnel } from "./registration-funnel"

function setup(overrides: Partial<RegistrationActions> = {}) {
  const actions: RegistrationActions = {
    checkEligibility: jest.fn(async (postcode: string) => ({ ok: true as const, postcode, ikfzStatus: "online" as const })),
    startCheckout: jest.fn(async () => ({ ok: true as const, reference: "ZG-ABC123", clientSecret: "fake-secret" })),
    completeSimulatedPayment: jest.fn(async () => ({ ok: true })),
    ...overrides,
  }
  const user = userEvent.setup()
  render(<RegistrationFunnel payment={{ kind: "simulated" }} actions={actions} />)
  return { actions, user }
}

type User = ReturnType<typeof userEvent.setup>

async function enter(user: User, label: string, value: string) {
  await user.click(screen.getByLabelText(label))
  await user.paste(value)
}

const question = (name: RegExp) => within(screen.getByRole("group", { name }))
const next = (user: User) => user.click(screen.getByRole("button", { name: "Weiter" }))
const heading = () => screen.getByRole("heading", { level: 1 })

const REQUIREMENTS = [
  /fabrikneuer Pkw/,
  /Zulassungsbescheinigung Teil II mit dem Sicherheitscode/,
  /eVB-Nummer Ihrer Kfz-Versicherung/,
  /Privatperson, mindestens 18/,
  /deutsches Bankkonto/,
]

async function passRequirements(user: User, postcode = "10115") {
  for (const requirement of REQUIREMENTS) await user.click(question(requirement).getByRole("radio", { name: "Ja" }))
  await enter(user, "Postleitzahl Ihres Wohnorts", postcode)
  await next(user)
}

async function fillVehicle(user: User, engine = "Benzin oder Diesel") {
  await enter(user, "Fahrzeug-Identifizierungsnummer (FIN)", "fakevin0000000002")
  await user.click(screen.getByRole("radio", { name: engine }))
  await enter(user, "Teil-II-Nummer", "FAKE0001")
  await enter(user, "Teil-II-Sicherheitscode", "FAKECODE")
  await enter(user, "eVB-Nummer", "fakeevb")
  await next(user)
}

async function fillKeeper(user: User) {
  await enter(user, "Vorname", "Erika")
  await enter(user, "Nachname", "Mustermann")
  await user.click(screen.getByRole("radio", { name: "Weiblich" }))
  await user.type(screen.getByLabelText("Geburtsdatum"), "1990-05-17")
  await enter(user, "Geburtsort", "Musterstadt")
  await enter(user, "Straße", "Beispielstraße")
  await enter(user, "Hausnummer", "12a")
  await enter(user, "Ort", "Berlin")
  await enter(user, "Telefonnummer", "+49 30 23125000")
  await enter(user, "E-Mail-Adresse", "erika.mustermann@example.test")
  await next(user)
}

async function fillTax(user: User, iban = "DE89 3704 0044 0532 0130 00") {
  await enter(user, "IBAN", iban)
  await enter(user, "BIC", "cobadeffxxx")
  await enter(user, "Name der Bank", "Beispielbank")
  await next(user)
}

async function reachReview(user: User, engine?: string) {
  await passRequirements(user)
  await fillVehicle(user, engine)
  await fillKeeper(user)
  await next(user)
  await fillTax(user)
}

function expectEveryControlNamed() {
  const controls = [...screen.queryAllByRole("textbox"), ...screen.queryAllByRole("radio"), ...screen.queryAllByRole("checkbox"), ...screen.queryAllByRole("combobox")]
  expect(controls.length).toBeGreaterThan(0)
  for (const control of controls) expect(control).toHaveAccessibleName()
  // Password and date inputs have no ARIA role to query by.
  for (const input of document.querySelectorAll("input[type=password], input[type=date]")) expect(input).toHaveAccessibleName()
}

const consentBoxes = () => screen.getAllByRole("checkbox")
const payButton = () => screen.getByRole("button", { name: "Jetzt bezahlen" })
const tickAll = async (user: User) => {
  for (const box of consentBoxes()) await user.click(box)
}

describe("Neuzulassung funnel", () => {
  it("shows nothing to pay when the browser lands on a later step without the earlier ones, as after a reload and then back", () => {
    setup()

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: { funnelStep: 5 } }))
    })

    expect(screen.queryByRole("button", { name: "Jetzt bezahlen" })).not.toBeInTheDocument()
    expect(screen.queryByLabelText("IBAN")).not.toBeInTheDocument()
  })

  describe("requirements", () => {
    it("keeps the customer here until every question is answered yes and a postcode is given", async () => {
      const { user } = setup()
      expect(screen.getByRole("button", { name: "Weiter" })).toBeDisabled()

      for (const requirement of REQUIREMENTS) await user.click(question(requirement).getByRole("radio", { name: "Ja" }))
      expect(screen.getByRole("button", { name: "Weiter" })).toBeDisabled()

      await enter(user, "Postleitzahl Ihres Wohnorts", "10115")
      expect(screen.getByRole("button", { name: "Weiter" })).toBeEnabled()
      expectEveryControlNamed()
    })

    it.each([
      [REQUIREMENTS[0], /fabrikneue Pkw/],
      [REQUIREMENTS[1], /Rubbelfeld|Händler/],
      [REQUIREMENTS[2], /Kfz-Versicherung/],
      [REQUIREMENTS[3], /Privatpersonen ab 18/],
      [REQUIREMENTS[4], /deutsche IBAN/],
    ])("stops a customer who answers no to %s, and says what to do instead", async (requirement, alternative) => {
      const { user } = setup()
      for (const other of REQUIREMENTS) await user.click(question(other).getByRole("radio", { name: "Ja" }))
      await enter(user, "Postleitzahl Ihres Wohnorts", "10115")

      await user.click(question(requirement).getByRole("radio", { name: "Nein" }))

      expect(screen.getByRole("status")).toHaveTextContent(alternative)
      expect(screen.getByRole("button", { name: "Weiter" })).toBeDisabled()
    })

    it("asks the authority for the postcode and moves on", async () => {
      const { user, actions } = setup()

      await passRequirements(user)

      expect(actions.checkEligibility).toHaveBeenCalledWith("10115")
      expect(heading()).toHaveTextContent("Ihr Fahrzeug")
    })

    it("keeps the customer on the step when no authority answers for the postcode", async () => {
      const { user } = setup({ checkEligibility: jest.fn(async () => ({ ok: false as const, reason: "invalidPostcode" as const })) })

      await passRequirements(user, "99999")

      expect(screen.getByLabelText("Postleitzahl Ihres Wohnorts")).toHaveAccessibleDescription(/keine Zulassungsstelle/)
      expect(screen.getByLabelText("Postleitzahl Ihres Wohnorts")).toHaveFocus()
      expect(heading()).toHaveTextContent("Können Sie online zulassen?")
    })

    it("tells the customer how long to wait when their address asked too often, and keeps them on the step", async () => {
      const { user } = setup({ checkEligibility: jest.fn(async () => ({ ok: false as const, reason: "limited" as const, retryAfterMinutes: 42 })) })

      await passRequirements(user)

      expect(screen.getByLabelText("Postleitzahl Ihres Wohnorts")).toHaveAccessibleDescription(/42 Minuten/)
      expect(heading()).toHaveTextContent("Können Sie online zulassen?")
    })

    it("lets the customer retry when the request itself rejects", async () => {
      const checkEligibility = jest
        .fn()
        .mockRejectedValueOnce(new Error("Network lost"))
        .mockResolvedValueOnce({ ok: true, postcode: "10115", ikfzStatus: "online" })
      const { user } = setup({ checkEligibility })

      await passRequirements(user)

      expect(await screen.findByText(/gerade nicht zu erreichen/)).toBeInTheDocument()
      await next(user)
      expect(await screen.findByRole("heading", { level: 1, name: "Ihr Fahrzeug" })).toBeInTheDocument()
    })

    it("warns before any data entry when the authority processes by hand", async () => {
      const { user } = setup({ checkEligibility: jest.fn(async (postcode: string) => ({ ok: true as const, postcode, ikfzStatus: "offline" as const })) })

      await passRequirements(user)

      expect(screen.getByText(/von Hand/)).toBeInTheDocument()
    })
  })

  describe("vehicle", () => {
    it("names every field, explains each empty one and focuses the first", async () => {
      const { user } = setup()
      await passRequirements(user)

      await next(user)

      expectEveryControlNamed()
      expect(screen.getByLabelText("Fahrzeug-Identifizierungsnummer (FIN)")).toHaveFocus()
      expect(screen.getByLabelText("Fahrzeug-Identifizierungsnummer (FIN)")).toHaveAttribute("aria-invalid", "true")
      expect(screen.getByLabelText("eVB-Nummer")).toHaveAccessibleDescription(/7 Zeichen aus Buchstaben und Ziffern/)
      expect(screen.getByRole("group", { name: "Antrieb" })).toHaveAccessibleDescription(/angetrieben/)
    })

    it("hides the codes of the car's papers while they are typed", async () => {
      const { user } = setup()
      await passRequirements(user)

      expect(screen.getByLabelText("eVB-Nummer")).toHaveAttribute("type", "password")
      expect(screen.getByLabelText("Teil-II-Sicherheitscode")).toHaveAttribute("type", "password")
    })

    it("refuses a VIN that is not 17 characters, as a new car's is", async () => {
      const { user } = setup()
      await passRequirements(user)
      await enter(user, "Fahrzeug-Identifizierungsnummer (FIN)", "SHORT123")

      await next(user)

      expect(screen.getByLabelText("Fahrzeug-Identifizierungsnummer (FIN)")).toHaveAttribute("aria-invalid", "true")
    })
  })

  describe("keeper", () => {
    async function reachKeeper(user: User) {
      await passRequirements(user)
      await fillVehicle(user)
    }

    it("starts the address with the postcode already given, and names every field", async () => {
      const { user } = setup()
      await reachKeeper(user)

      expect(screen.getByLabelText("Postleitzahl")).toHaveValue("10115")
      expectEveryControlNamed()
    })

    it("refuses a keeper under 18", async () => {
      const { user } = setup()
      await reachKeeper(user)
      const sixteen = new Date()
      sixteen.setFullYear(sixteen.getFullYear() - 16)
      await user.type(screen.getByLabelText("Geburtsdatum"), sixteen.toISOString().slice(0, 10))

      await next(user)

      expect(screen.getByLabelText("Geburtsdatum")).toHaveAccessibleDescription(/mindestens 18/)
      expect(heading()).toHaveTextContent("Der Halter")
    })

    it("asks the authority again when the postcode is changed, so the notice is about the right town", async () => {
      const { user, actions } = setup()
      await reachKeeper(user)
      await user.clear(screen.getByLabelText("Postleitzahl"))

      await fillKeeperWithPostcode(user, "80331")

      expect(actions.checkEligibility).toHaveBeenLastCalledWith("80331")
      expect(await screen.findByRole("heading", { level: 1, name: "Ihr Kennzeichen" })).toBeInTheDocument()
    })

    it("does not ask again when the postcode is the one already checked", async () => {
      const { user, actions } = setup()
      await reachKeeper(user)

      await fillKeeper(user)

      expect(actions.checkEligibility).toHaveBeenCalledTimes(1)
    })

    it("starts the address with the postcode from step 1 again when the customer goes back and changes it", async () => {
      const { user, actions } = setup()
      await reachKeeper(user)
      await user.click(screen.getByRole("button", { name: "Zurück" }))
      await user.click(screen.getByRole("button", { name: "Zurück" }))
      await user.clear(screen.getByLabelText("Postleitzahl Ihres Wohnorts"))
      await enter(user, "Postleitzahl Ihres Wohnorts", "80331")
      await next(user)
      await next(user)

      expect(await screen.findByLabelText("Postleitzahl")).toHaveValue("80331")
      expect(actions.checkEligibility).toHaveBeenLastCalledWith("80331")
    })

    it("keeps what was typed when the customer goes back to the vehicle and forward again", async () => {
      const { user } = setup()
      await reachKeeper(user)
      await enter(user, "Vorname", "Erika")

      await user.click(screen.getByRole("button", { name: "Zurück" }))
      await next(user)

      expect(await screen.findByLabelText("Vorname")).toHaveValue("Erika")
    })

    it("stays where the customer went when they go back while a changed postcode is still being checked", async () => {
      let answer!: (result: { ok: true; postcode: string; ikfzStatus: "online" }) => void
      const checkEligibility = jest
        .fn()
        .mockResolvedValueOnce({ ok: true, postcode: "10115", ikfzStatus: "online" })
        .mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
      const { user } = setup({ checkEligibility })
      await reachKeeper(user)
      await user.clear(screen.getByLabelText("Postleitzahl"))
      await fillKeeperWithPostcode(user, "80331")

      await user.click(screen.getByRole("button", { name: "Zurück" }))
      await act(async () => answer({ ok: true, postcode: "80331", ikfzStatus: "online" }))

      expect(heading()).toHaveTextContent("Ihr Fahrzeug")
    })

    it("moves focus to the postcode when the authority cannot be reached", async () => {
      const checkEligibility = jest
        .fn()
        .mockResolvedValueOnce({ ok: true, postcode: "10115", ikfzStatus: "online" })
        .mockRejectedValueOnce(new Error("Network lost"))
      const { user } = setup({ checkEligibility })
      await reachKeeper(user)
      await user.clear(screen.getByLabelText("Postleitzahl"))

      await fillKeeperWithPostcode(user, "80331")

      expect(await screen.findByLabelText("Postleitzahl")).toHaveAccessibleDescription(/nicht zu erreichen/)
      expect(screen.getByLabelText("Postleitzahl")).toHaveFocus()
    })

    it("keeps the customer on the step when no authority answers for the new postcode", async () => {
      const checkEligibility = jest
        .fn()
        .mockResolvedValueOnce({ ok: true, postcode: "10115", ikfzStatus: "online" })
        .mockResolvedValueOnce({ ok: false, reason: "invalidPostcode" })
      const { user } = setup({ checkEligibility })
      await reachKeeper(user)
      await user.clear(screen.getByLabelText("Postleitzahl"))

      await fillKeeperWithPostcode(user, "99999")

      expect(await screen.findByLabelText("Postleitzahl")).toHaveAccessibleDescription(/keine Zulassungsstelle/)
      expect(screen.getByLabelText("Postleitzahl")).toHaveFocus()
      expect(heading()).toHaveTextContent("Der Halter")
    })

    async function fillKeeperWithPostcode(user: User, postcode: string) {
      await enter(user, "Postleitzahl", postcode)
      await fillKeeper(user)
    }
  })

  describe("plate", () => {
    async function reachPlate(user: User, engine?: string) {
      await passRequirements(user)
      await fillVehicle(user, engine)
      await fillKeeper(user)
    }

    it("offers an E-plate only for an electric car", async () => {
      const { user } = setup()
      await reachPlate(user, "Elektro")
      expect(screen.getByRole("checkbox", { name: /E-Kennzeichen/ })).toBeInTheDocument()
    })

    it.each(["Hybrid", "Benzin oder Diesel"])("offers no E-plate for a car that is %s", async (engine) => {
      const { user } = setup()
      await reachPlate(user, engine)

      expect(screen.queryByRole("checkbox", { name: /E-Kennzeichen/ })).not.toBeInTheDocument()
      expect(screen.getByRole("checkbox", { name: /Saisonkennzeichen/ })).toBeInTheDocument()
    })

    it("asks for the season's months only once a season is wanted, and for both", async () => {
      const { user } = setup()
      await reachPlate(user)
      expect(screen.queryByLabelText("Erster Monat der Saison")).not.toBeInTheDocument()

      await user.click(screen.getByRole("checkbox", { name: /Saisonkennzeichen/ }))
      await next(user)

      expect(screen.getByLabelText("Erster Monat der Saison")).toHaveAccessibleDescription(/ersten Monat/)
      expect(screen.getByLabelText("Letzter Monat der Saison")).toHaveAccessibleDescription(/letzten Monat/)
      expectEveryControlNamed()

      await user.selectOptions(screen.getByLabelText("Erster Monat der Saison"), "April")
      await user.selectOptions(screen.getByLabelText("Letzter Monat der Saison"), "Oktober")
      await next(user)
      expect(heading()).toHaveTextContent("Konto für die Kfz-Steuer")
    })

    it("lets the customer go on without choosing anything", async () => {
      const { user } = setup()
      await reachPlate(user)

      await next(user)

      expect(heading()).toHaveTextContent("Konto für die Kfz-Steuer")
    })

    it("forgets an E-plate asked for an electric car once the customer changes the car to one that is not electric", async () => {
      const { user } = setup()
      await reachPlate(user, "Elektro")
      await user.click(screen.getByRole("checkbox", { name: /E-Kennzeichen/ }))
      await next(user)
      await fillTax(user)
      expect(within(screen.getByRole("region", { name: "Ihre Angaben" })).getByText(/E-Kennzeichen/)).toBeInTheDocument()

      for (let step = 0; step < 4; step++) await user.click(screen.getByRole("button", { name: "Zurück" }))
      await user.click(screen.getByRole("radio", { name: "Benzin oder Diesel" }))
      for (let step = 0; step < 4; step++) await next(user)

      expect(within(screen.getByRole("region", { name: "Ihre Angaben" })).getByText("Vergibt die Zulassungsstelle")).toBeInTheDocument()
    })
  })

  describe("tax", () => {
    async function reachTax(user: User) {
      await passRequirements(user)
      await fillVehicle(user)
      await fillKeeper(user)
      await next(user)
    }

    it("says a typo in the IBAN is probably a typo", async () => {
      const { user } = setup()
      await reachTax(user)

      await fillTax(user, "DE00 3704 0044 0532 0130 00")

      expect(screen.getByLabelText("IBAN")).toHaveAccessibleDescription(/Tippfehler/)
      expect(screen.getByLabelText("IBAN")).toHaveFocus()
      expect(heading()).toHaveTextContent("Konto für die Kfz-Steuer")
    })

    it("says that only a German IBAN is taken", async () => {
      const { user } = setup()
      await reachTax(user)

      await fillTax(user, "AT61 1904 3002 3457 3201")

      expect(screen.getByLabelText("IBAN")).toHaveAccessibleDescription(/beginnt mit DE und hat 22 Stellen/)
    })

    it("takes an IBAN pasted with spaces around it, as copied from a bank statement", async () => {
      const { user } = setup()
      await reachTax(user)

      await fillTax(user, "  DE89 3704 0044 0532 0130 00  ")

      expect(heading()).toHaveTextContent("Prüfen und bezahlen")
    })

    it("names every field", async () => {
      const { user } = setup()
      await reachTax(user)

      expectEveryControlNamed()
    })
  })

  describe("review and payment", () => {
    it("shows the processing fee before payment and keeps payment impossible until all three consents are given", async () => {
      const { user } = setup()
      await reachReview(user)

      const notice = screen.getByText(/behalten wir 19,99\s€ Bearbeitungsgebühr ein/)
      expect(notice).toHaveTextContent(/erstatten den Rest innerhalb von 3–5 Werktagen/)
      expect(screen.getByText(/129,00\s€/, { selector: "dd" })).toBeInTheDocument()
      expect(consentBoxes()).toHaveLength(3)
      expect(payButton()).toBeDisabled()

      await user.click(consentBoxes()[0])
      await user.click(consentBoxes()[1])
      expect(payButton()).toBeDisabled()

      await user.click(consentBoxes()[2])
      expect(payButton()).toBeEnabled()
    })

    it("asks for the power of attorney as a consent of its own", async () => {
      const { user } = setup()
      await reachReview(user)

      expect(screen.getByRole("checkbox", { name: /bevollmächtige ZulexGO/ })).toBeInTheDocument()
    })

    it("shows the customer what they entered, except the codes of the car's papers", async () => {
      const { user } = setup()
      await reachReview(user)

      const summary = screen.getByRole("region", { name: "Ihre Angaben" })
      for (const shown of ["FAKEVIN0000000002", "Erika Mustermann", "17.05.1990", "Beispielstraße 12a, 10115 Berlin", "DE89 3704 0044 0532 0130 00", "COBADEFFXXX"]) {
        expect(within(summary).getByText(shown)).toBeInTheDocument()
      }
      for (const code of ["FAKECODE", "FAKEEVB"]) expect(within(summary).queryByText(new RegExp(code))).not.toBeInTheDocument()
      expect(within(summary).getAllByText("•••••••")).toHaveLength(2)
    })

    it("keeps everything entered when going back from the review", async () => {
      const { user } = setup()
      await reachReview(user)

      await user.click(screen.getByRole("button", { name: "Zurück" }))

      expect(await screen.findByLabelText("IBAN")).toHaveValue("DE89 3704 0044 0532 0130 00")
      await user.click(screen.getByRole("button", { name: "Zurück" }))
      await user.click(screen.getByRole("button", { name: "Zurück" }))
      expect(await screen.findByLabelText("Vorname")).toHaveValue("Erika")
    })

    it("goes back one step with the browser's back button, keeping what was entered", async () => {
      const { user } = setup()
      await reachReview(user)

      act(() => window.history.back())

      expect(await screen.findByRole("heading", { level: 1, name: "Konto für die Kfz-Steuer" })).toBeInTheDocument()
      expect(screen.getByLabelText("BIC")).toHaveValue("COBADEFFXXX")
    })

    it("pays with everything entered and all three consents, then confirms with the order ID and what comes next", async () => {
      const { user, actions } = setup()
      await reachReview(user)
      await tickAll(user)

      await user.click(payButton())

      expect(actions.startCheckout).toHaveBeenCalledWith({
        data: expect.objectContaining({ vin: "FAKEVIN0000000002", firstName: "Erika", iban: "DE89 3704 0044 0532 0130 00", evbNumber: "FAKEEVB" }),
        consents: { terms: true, earlyStart: true, powerOfAttorney: true },
      })
      expect(actions.completeSimulatedPayment).toHaveBeenCalledWith("ZG-ABC123")
      expect(await screen.findByText("ZG-ABC123")).toBeInTheDocument()
      expect(screen.getByText("erika.mustermann@example.test")).toBeInTheDocument()
      expect(screen.getByText(/Identitätsprüfung/)).toBeInTheDocument()
    })

    it("stays on the confirmation when the browser goes back after paying, so nothing is paid twice", async () => {
      const { user } = setup()
      await reachReview(user)
      await tickAll(user)
      await user.click(payButton())
      await screen.findByText("ZG-ABC123")

      await act(async () => {
        window.history.back()
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      expect(screen.getByText("ZG-ABC123")).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Jetzt bezahlen" })).not.toBeInTheDocument()
    })

    it("warns that this car already has an open order, takes no payment until the customer says they want another, and then tells the server", async () => {
      const startCheckout = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, reason: "duplicate" })
        .mockResolvedValueOnce({ ok: true, reference: "ZG-ABC123", clientSecret: "fake-secret" })
      const { user, actions } = setup({ startCheckout })
      await reachReview(user)
      await tickAll(user)

      await user.click(payButton())

      expect(await screen.findByRole("alert")).toHaveTextContent(/bereits ein Antrag/)
      expect(actions.completeSimulatedPayment).not.toHaveBeenCalled()
      expect(payButton()).toBeDisabled()

      await user.click(screen.getByRole("checkbox", { name: /trotzdem einen weiteren Antrag/ }))
      await user.click(payButton())

      expect(startCheckout).toHaveBeenLastCalledWith(expect.objectContaining({ acknowledgedDuplicate: true }))
      expect(await screen.findByText("ZG-ABC123")).toBeInTheDocument()
    })

    it("tells the customer how long to wait when their address opened too many checkouts, and lets them pay once it has passed", async () => {
      const startCheckout = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, reason: "limited", retryAfterMinutes: 42 })
        .mockResolvedValueOnce({ ok: true, reference: "ZG-ABC123", clientSecret: "fake-secret" })
      const { user, actions } = setup({ startCheckout })
      await reachReview(user)
      await tickAll(user)

      await user.click(payButton())

      expect(await screen.findByRole("alert")).toHaveTextContent(/42 Minuten/)
      expect(actions.completeSimulatedPayment).not.toHaveBeenCalled()
      expect(payButton()).toBeEnabled()

      await user.click(payButton())

      expect(await screen.findByText("ZG-ABC123")).toBeInTheDocument()
    })

    it("tells a customer of the beta that today's places are gone, and that tomorrow they can try again", async () => {
      const { user } = setup({ startCheckout: jest.fn(async () => ({ ok: false as const, reason: "full" as const })) })
      await reachReview(user)
      await tickAll(user)

      await user.click(payButton())

      expect(await screen.findByRole("alert")).toHaveTextContent(/Heute sind alle Plätze vergeben/)
      expect(payButton()).toBeEnabled()
    })

    it("tells a customer whose invite no longer works, instead of calling it a fault", async () => {
      const { user } = setup({ startCheckout: jest.fn(async () => ({ ok: false as const, reason: "invite" as const })) })
      await reachReview(user)
      await tickAll(user)

      await user.click(payButton())

      expect(await screen.findByRole("alert")).toHaveTextContent(/Einladung/)
    })

    it("tells the customer when the server refuses the details, and lets them go back to fix them", async () => {
      const { user } = setup({ startCheckout: jest.fn(async () => ({ ok: false as const, reason: "invalid" as const })) })
      await reachReview(user)
      await tickAll(user)

      await user.click(payButton())

      expect(await screen.findByRole("alert")).toHaveTextContent(/Einige Angaben sind nicht gültig/)
      expect(payButton()).toBeEnabled()
    })
  })
})
