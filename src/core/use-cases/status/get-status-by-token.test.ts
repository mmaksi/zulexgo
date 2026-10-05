import { aNewRegistrationApplication, anApplication, FAKE_REQUEST } from "@/tests/fixtures/applications"
import { FAKE_NEW_REGISTRATION } from "@/tests/fixtures/new-registration"
import type { Application } from "@/src/core/domain/application/application"
import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import type { DocumentRef } from "@/src/core/domain/registration/document"
import { Money } from "@/src/core/domain/payment/money"
import { SERVICE_PRICES } from "@/src/core/domain/payment/pricing"
import { TokenInvalid } from "@/src/core/errors/application/token-invalid"
import type { PaymentProvider } from "@/src/core/ports/payment/payment-provider"
import { getStatusByToken } from "./get-status-by-token"

const TOKEN = "faketoken-status"
const application = anApplication({ status: "submitted_to_kba" })
const repository = { findByStatusToken: async (token: string) => (token === TOKEN ? application : undefined) }
const storeOf = (stored: Map<ApplicationReference, DocumentRef[]> = new Map()) => ({ list: async (reference: ApplicationReference) => stored.get(reference) ?? [] })
const held = Money.ofCents(4900)
const paymentOf = (captured: number, refunded = 0) => async () => ({
  id: "fake-payment",
  status: "captured" as const,
  amount: held,
  captured: Money.ofCents(captured),
  refunded: Money.ofCents(refunded),
})
const payments = { getPayment: paymentOf(1999) }
const deps = { repository, documents: storeOf(), payments }

describe("getStatusByToken", () => {
  it("describes the application behind a status link", async () => {
    const view = await getStatusByToken(deps, TOKEN)

    expect(view).toMatchObject({
      reference: application.reference,
      status: "submitted_to_kba",
      licencePlate: FAKE_REQUEST.licencePlate,
      vinEnding: "0001",
    })
    expect(view.steps.map((step) => step.id)).toEqual(["paid", "kba", "outcome"])
  })

  it("says which service the order is for, so the page shows that service's summary", async () => {
    expect((await getStatusByToken(deps, TOKEN)).service).toBe("deregistration")
  })

  it("says how many plates the vehicle has, so a correction asks for the right codes", async () => {
    expect(await getStatusByToken(deps, TOKEN)).toMatchObject({ plateCount: 2 })
  })

  it("carries no security code and no full VIN, so the page cannot render one", async () => {
    const serialised = JSON.stringify(await getStatusByToken(deps, TOKEN))

    for (const code of Object.values(FAKE_REQUEST.codes)) expect(serialised).not.toContain(code)
    expect(serialised).not.toContain(FAKE_REQUEST.vin)
  })

  describe("a Neuzulassung order", () => {
    const newRegistration = aNewRegistrationApplication({ status: "failed_correctable" })
    const newRegistrationDeps = { ...deps, repository: { findByStatusToken: async () => newRegistration } }

    it("says it is a Neuzulassung and shows the end of its VIN, with no plate it does not have", async () => {
      const view = await getStatusByToken(newRegistrationDeps, TOKEN)

      expect(view).toMatchObject({ service: "newRegistration", reference: newRegistration.reference, vinEnding: "0002" })
      expect(view).not.toHaveProperty("licencePlate")
      expect(view.steps.map((step) => step.id)).toEqual(["paid", "verification", "verified", "kba", "outcome"])
    })

    it("carries nothing the customer typed but the end of the VIN, so the page cannot render it", async () => {
      const serialised = JSON.stringify(await getStatusByToken(newRegistrationDeps, TOKEN))
      const { owner, bankAccount, registrationCertificate, evbNumber, vin } = FAKE_NEW_REGISTRATION

      for (const typed of [vin, evbNumber, registrationCertificate.number, registrationCertificate.securityCode, ...Object.values(bankAccount), owner.firstName, owner.lastName, owner.birthDate, owner.birthPlace, owner.phone, owner.email, owner.address.street]) {
        expect(serialised).not.toContain(typed)
      }
    })

    it("offers the cancellation and a correction, while its money is whole", async () => {
      const heldInFull = async () => ({ id: "p", status: "held" as const, amount: SERVICE_PRICES.newRegistration, captured: Money.ofCents(0), refunded: Money.ofCents(0) })

      const view = await getStatusByToken({ ...newRegistrationDeps, payments: { getPayment: heldInFull } }, TOKEN)

      expect(view.correctable).toBe(true)
      expect(view.cancellation).toBeDefined()
    })

    it("cannot be corrected once part of its money has gone back", async () => {
      const view = await getStatusByToken(newRegistrationDeps, TOKEN)

      expect(view.correctable).toBe(false)
    })

    describe("whether the owner's name and birth date can be corrected", () => {
      const at = (status: Application["status"]) => ({ status, at: new Date("2026-03-01T09:00:00.000Z") })
      const viewOf = (history: Application["history"]) =>
        getStatusByToken({ ...deps, repository: { findByStatusToken: async () => aNewRegistrationApplication({ status: "failed_correctable", history }) } }, TOKEN)

      it("can, while the identity was never verified: a mismatch sent the order back", async () => {
        const view = await viewOf([at("submitted_and_paid"), at("awaiting_identity_verification"), at("failed_correctable")])

        expect(view).toMatchObject({ service: "newRegistration", ownerCorrectable: true })
      })

      it("cannot once it was verified, whatever sent the order back", async () => {
        const view = await viewOf([at("submitted_and_paid"), at("awaiting_identity_verification"), at("identity_verified"), at("submitted_to_kba"), at("failed_correctable")])

        expect(view).toMatchObject({ ownerCorrectable: false })
      })
    })

    describe("the wait for the customer's identity check", () => {
      const deadline = new Date("2026-03-05T09:00:00.000Z")
      const waiting = aNewRegistrationApplication({ status: "awaiting_identity_verification", identityVerification: { id: "fake-verification", deadline, reminderSent: false } })
      const viewOf = (order: Application) => getStatusByToken({ ...deps, repository: { findByStatusToken: async () => order } }, TOKEN)

      it("names the deadline the customer was given, which is the one enforced", async () => {
        expect(await viewOf(waiting)).toMatchObject({ verificationDeadline: deadline })
      })

      it.each(["submitted_and_paid", "identity_verified", "submitted_to_kba", "completed"] as const)("names none at %s, when nobody is waiting", async (status) => {
        const view = await viewOf({ ...waiting, status })

        expect(view.service === "newRegistration" && view.verificationDeadline).toBeUndefined()
      })

      it("carries neither the verification's id nor a link to it", async () => {
        expect(JSON.stringify(await viewOf(waiting))).not.toContain("fake-verification")
      })
    })
  })

  it.each(["faketoken-unknown", ""])("refuses a link no application answers to (%p)", async (token) => {
    await expect(getStatusByToken(deps, token)).rejects.toBeInstanceOf(TokenInvalid)
  })

  describe("the documents", () => {
    const finished = anApplication({ status: "completed" })
    const finishedRepository = { findByStatusToken: async () => finished }

    it("lists those stored for a finished order, the confirmation first, and none of another order's", async () => {
      const stranger = anApplication()
      const stored = new Map<ApplicationReference, DocumentRef[]>([
        [finished.reference, [{ id: "8", kind: "fee" }, { id: "9", kind: "confirmation" }, { id: "7", kind: "unknown" }]],
        [stranger.reference, [{ id: "6", kind: "confirmation" }]],
      ])

      const view = await getStatusByToken({ repository: finishedRepository, documents: storeOf(stored), payments }, TOKEN)

      expect(view.documents).toEqual([
        { id: "9", kind: "confirmation" },
        { id: "8", kind: "fee" },
        { id: "7", kind: "unknown" },
      ])
    })

    it("lists the temporary certificate after the confirmation and before a refusal, the fee and the unknown", async () => {
      const stored = new Map<ApplicationReference, DocumentRef[]>([
        [
          finished.reference,
          [{ id: "5", kind: "unknown" }, { id: "4", kind: "fee" }, { id: "3", kind: "rejection" }, { id: "2", kind: "temporaryCertificate" }, { id: "1", kind: "confirmation" }],
        ],
      ])

      const view = await getStatusByToken({ repository: finishedRepository, documents: storeOf(stored), payments }, TOKEN)

      expect(view.documents.map(({ kind }) => kind)).toEqual(["confirmation", "temporaryCertificate", "rejection", "fee", "unknown"])
    })

    it("lists none for a finished order that has none", async () => {
      expect((await getStatusByToken({ repository: finishedRepository, documents: storeOf(), payments }, TOKEN)).documents).toEqual([])
    })

    it("does not ask the store about an order that is still in progress, which has nothing to download", async () => {
      const list = jest.fn(async () => [])

      const view = await getStatusByToken({ repository, documents: { list }, payments }, TOKEN)

      expect(view.documents).toEqual([])
      expect(list).not.toHaveBeenCalled()
    })

    it("still shows the page when the store cannot be read, so a storage outage never takes every status page down", async () => {
      const error = jest.spyOn(console, "error").mockImplementation(() => {})
      const broken = { list: async () => Promise.reject(new Error("Supabase Storage list failed (500)")) }

      const view = await getStatusByToken({ repository: finishedRepository, documents: broken, payments }, TOKEN)

      expect(view.documents).toEqual([])
      expect(error.mock.calls.flat().join(" ")).toContain("[status]")
      error.mockRestore()
    })
  })

  describe("what cancelling a 5b would do", () => {
    const viewOf = (status: Application["status"]) => {
      const order = anApplication({ status })
      return getStatusByToken({ repository: { findByStatusToken: async () => order }, documents: storeOf(), payments }, TOKEN)
    }

    it("states what the order would get back and what the fee keeps, before the customer decides", async () => {
      expect((await viewOf("failed_correctable")).cancellation).toEqual({ returned: Money.ofCents(2901), retained: Money.ofCents(1999) })
    })

    it.each(["submitted_to_kba", "completed", "failed_final", "cancelled"] as const)("states nothing for an order that is %s", async (status) => {
      expect((await viewOf(status)).cancellation).toBeUndefined()
    })
  })

  describe("whether a 5b can still be corrected", () => {
    const orderAt5b = anApplication({ status: "failed_correctable" })
    const viewWith = (getPayment: PaymentProvider["getPayment"]) =>
      getStatusByToken({ repository: { findByStatusToken: async () => orderAt5b }, documents: storeOf(), payments: { getPayment } }, TOKEN)
    const held = async () => ({ id: "p", status: "held" as const, amount: Money.ofCents(4900), captured: Money.ofCents(0), refunded: Money.ofCents(0) })

    it("can while its money is whole, held or taken in full", async () => {
      expect((await viewWith(held)).correctable).toBe(true)
      expect((await viewWith(paymentOf(4900))).correctable).toBe(true)
    })

    it("cannot once part of its money has gone back: only the cancel is left to finish", async () => {
      expect((await viewWith(paymentOf(6999, 5000))).correctable).toBe(false)
      expect((await viewWith(paymentOf(1999))).correctable).toBe(false)
    })

    it("offers it when the provider cannot be asked, since correcting checks again", async () => {
      expect((await viewWith(async () => Promise.reject(new Error("Stripe is down")))).correctable).toBe(true)
    })

    it.each(["submitted_to_kba", "completed", "failed_final", "cancelled"] as const)("says nothing for an order that is %s", async (status) => {
      const order = anApplication({ status })
      const view = await getStatusByToken({ repository: { findByStatusToken: async () => order }, documents: storeOf(), payments }, TOKEN)

      expect(view.correctable).toBeUndefined()
    })
  })

  describe("why an order failed", () => {
    const CATALOGUE = { 101: { class: "correctable" as const, reason: "Die FIN wurde nicht akzeptiert." } }
    const viewOf = (overrides: Parameters<typeof anApplication>[0]) => {
      const failed = anApplication(overrides)
      return getStatusByToken(
        { repository: { findByStatusToken: async () => failed }, documents: storeOf(), payments, errorCatalogue: CATALOGUE },
        TOKEN,
      )
    }

    it("gives the catalogue's wording for the KBA's code", async () => {
      const view = await viewOf({ status: "failed_correctable", failure: { kind: "kbaError", code: 101 } })

      expect(view.failureReason).toBe("Die FIN wurde nicht akzeptiert.")
    })

    it("gives a general wording for a code the catalogue lacks, and never the code", async () => {
      const view = await viewOf({ status: "failed_correctable", failure: { kind: "kbaError", code: 987 } })

      expect(view.failureReason).toBeTruthy()
      expect(view.failureReason).not.toContain("987")
    })

    it("still gives a wording for a failure stored before failures were kept", async () => {
      expect((await viewOf({ status: "failed_final" })).failureReason).toBeTruthy()
    })

    it.each(["submitted_to_kba", "completed", "cancelled"] as const)("gives none for an order that is %s", async (status) => {
      expect((await viewOf({ status, failure: { kind: "kbaError", code: 101 } })).failureReason).toBeUndefined()
    })
  })

  describe("what comes back to the customer", () => {
    const viewOf = (status: "failed_final" | "cancelled" | "completed", getPayment = payments.getPayment) => {
      const ended = anApplication({ status })
      return getStatusByToken(
        { repository: { findByStatusToken: async () => ended }, documents: storeOf(), payments: { getPayment } },
        TOKEN,
      )
    }

    it.each(["failed_final", "cancelled"] as const)("states, for a %s order, what the provider returned and what it kept", async (status) => {
      expect((await viewOf(status)).refund).toEqual({ returned: Money.ofCents(2901), retained: Money.ofCents(1999) })
    })

    it("counts a released hold as everything returned", async () => {
      expect((await viewOf("failed_final", paymentOf(0))).refund).toEqual({ returned: held, retained: Money.ofCents(0) })
    })

    it("states nothing for an order that was not refunded, and asks the provider nothing", async () => {
      const getPayment = jest.fn(payments.getPayment)

      expect((await viewOf("completed", getPayment)).refund).toBeUndefined()
      expect((await getStatusByToken(deps, TOKEN)).refund).toBeUndefined()
      expect(getPayment).not.toHaveBeenCalled()
    })

    it("still shows the page when the provider cannot be asked", async () => {
      const failing = async () => {
        throw new Error("Stripe is down")
      }

      expect((await viewOf("failed_final", failing)).refund).toBeUndefined()
    })
  })
})
