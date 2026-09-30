import { anApplication, FAKE_REQUEST } from "@/tests/fixtures/applications"
import type { ApplicationReference } from "@/src/core/domain/application-reference"
import type { DocumentRef } from "@/src/core/domain/document"
import { Money } from "@/src/core/domain/money"
import { TokenInvalid } from "@/src/core/errors/token-invalid"
import { getStatusByToken } from "./get-status-by-token"

const TOKEN = "faketoken-status"
const application = anApplication({ status: "submitted_to_kba" })
const repository = { findByStatusToken: async (token: string) => (token === TOKEN ? application : undefined) }
const storeOf = (stored: Map<ApplicationReference, DocumentRef[]> = new Map()) => ({ list: async (reference: ApplicationReference) => stored.get(reference) ?? [] })
const held = Money.ofCents(6999)
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

  it("carries no security code and no full VIN, so the page cannot render one", async () => {
    const serialised = JSON.stringify(await getStatusByToken(deps, TOKEN))

    for (const code of Object.values(FAKE_REQUEST.codes)) expect(serialised).not.toContain(code)
    expect(serialised).not.toContain(FAKE_REQUEST.vin)
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

  describe("what comes back to the customer", () => {
    const viewOf = (status: "failed_final" | "cancelled" | "completed", getPayment = payments.getPayment) => {
      const ended = anApplication({ status })
      return getStatusByToken(
        { repository: { findByStatusToken: async () => ended }, documents: storeOf(), payments: { getPayment } },
        TOKEN,
      )
    }

    it.each(["failed_final", "cancelled"] as const)("states, for a %s order, what the provider returned and what it kept", async (status) => {
      expect((await viewOf(status)).refund).toEqual({ returned: Money.ofCents(5000), retained: Money.ofCents(1999) })
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
