import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import { cancelApplication } from "@/src/core/use-cases/application/cancel-application"
import { getStatusByToken } from "@/src/core/use-cases/status/get-status-by-token"
import { setupFlow } from "./flow-harness"

/**
 * N8, launch plan Q54 (provisional): a Neuzulassung's bank account is the owner's, for the vehicle tax the
 * filing sets up, and nothing needs it once the order is over. Each way an order can end is driven through
 * the real use cases on the fakes, and none may leave the account stored. While the order is open it stays,
 * since a 5b can still file the order afresh with it.
 */
type Flow = ReturnType<typeof setupFlow>

const holdsAccount = async (flow: Flow, reference: ApplicationReference) => {
  const { request } = await flow.stored(reference)
  return request.service === "newRegistration" && request.bankAccount !== undefined
}

/** Paid, verified as the owner and filed: at the KBA, status 4. */
async function filedOrder(flow: Flow) {
  const reference = await flow.checkoutAndPayNewRegistration()
  await flow.customerVerifies(reference)
  await flow.poll(5)
  expect((await flow.stored(reference)).status).toBe("submitted_to_kba")
  return reference
}

/** Refused by the KBA with a code the catalogue calls correctable: 5b, which the customer may still correct or cancel. */
async function atFiveB(flow: Flow) {
  const reference = await filedOrder(flow)
  flow.deps.registration.setStatus(await flow.zulexId(reference), { state: "failed", error: { code: 101, details: [] }, documents: [] })
  await flow.poll(1)
  expect((await flow.stored(reference)).status).toBe("failed_correctable")
  return reference
}

describe("a Neuzulassung's bank account, until its order ends", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  describe("is held while the order may still be filed", () => {
    it("after payment, while the customer verifies", async () => {
      const flow = setupFlow()

      const reference = await flow.checkoutAndPayNewRegistration()

      expect(await holdsAccount(flow, reference)).toBe(true)
    })

    it("while the KBA works on it", async () => {
      const flow = setupFlow()

      expect(await holdsAccount(flow, await filedOrder(flow))).toBe(true)
    })

    it("at 5b, where a correction may file the order afresh", async () => {
      const flow = setupFlow()

      expect(await holdsAccount(flow, await atFiveB(flow))).toBe(true)
    })
  })

  describe("is gone the moment the order ends", () => {
    it("completed (5a), and the order still reads and shows its status page", async () => {
      const flow = setupFlow()
      const reference = await filedOrder(flow)

      flow.deps.registration.setStatus(await flow.zulexId(reference), { state: "finished", documents: [] })
      await flow.poll(10)
      await flow.poll(30)

      expect((await flow.stored(reference)).status).toBe("completed")
      expect(await holdsAccount(flow, reference)).toBe(false)
      const token = (await flow.deps.repository.getStatusToken(reference))!
      expect(await getStatusByToken(flow.deps, token)).toMatchObject({ reference, status: "completed" })
    })

    it("refused by the KBA for good (5c)", async () => {
      const flow = setupFlow()
      const reference = await filedOrder(flow)

      flow.deps.registration.setStatus(await flow.zulexId(reference), { state: "failed", error: { code: 202, details: [] }, documents: [] })
      await flow.poll(1)

      expect((await flow.stored(reference)).status).toBe("failed_final")
      expect(await holdsAccount(flow, reference)).toBe(false)
    })

    it("cancelled by the customer at 5b", async () => {
      const flow = setupFlow()
      const reference = await atFiveB(flow)

      await cancelApplication(flow.deps, (await flow.deps.repository.getStatusToken(reference))!)

      expect((await flow.stored(reference)).status).toBe("cancelled")
      expect(await holdsAccount(flow, reference)).toBe(false)
    })

    it("when the provider could not verify the customer (5c)", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      await flow.customerFailsVerification(reference)

      await flow.poll(1)

      expect((await flow.stored(reference)).status).toBe("failed_final")
      expect(await holdsAccount(flow, reference)).toBe(false)
    })

    it("when the time to verify ran out", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()

      await flow.poll(4 * 24 * 60 + 1)

      expect((await flow.stored(reference)).status).toBe("cancelled")
      expect(await holdsAccount(flow, reference)).toBe(false)
    })
  })
})
