import { createRegistrationApplicationSpec } from "@/tests/fixtures/zulex"
import { SERVICE_PRICES } from "@/src/core/domain/payment/pricing"
import { pollDueApplications } from "@/src/core/use-cases/registration/poll-due-applications"
import { submitToKba } from "@/src/core/use-cases/registration/submit-to-kba"
import { withVendorsAtTheNetwork } from "./network-harness"

/**
 * N4: a Neuzulassung whose identity is verified is filed through the real Zulex adapter and its
 * documents come back through it, with Zulex and Stripe stubbed at the network. The verification
 * itself is proven in `identity-verification.test.ts`; here the order is made as the step leaves it
 * (paid, held, verified), so the test files it and watches the filing alone.
 */
const { world, stored, emails, verifiedNewRegistration: verifiedOrder } = withVendorsAtTheNetwork()

const HOUR = 60 * 60_000
const CONFIRMATION_ID = "9007199254740993"
const CERTIFICATE_ID = "12"

describe("a verified Neuzulassung, filed through the Zulex adapter", () => {
  it("is filed at the registration endpoint under its own idempotency key, paid for once Zulex has it, and the customer is told", async () => {
    const order = await verifiedOrder()

    await submitToKba(world.deps, order)

    const filed = await stored(order.reference)
    expect(filed.status).toBe("submitted_to_kba")
    const [sent] = world.zulex.requests
    expect(sent).toMatchObject({ method: "POST", path: "/zulex-api/v1/registration-applications" })
    expect(sent.headers.get("X-Idempotency-Key")).toBe(order.idempotencyKey)
    expect(createRegistrationApplicationSpec.safeParse(sent.body).success).toBe(true)
    expect(world.zulex.applications.has(filed.zulexApplicationId!)).toBe(true)
    expect(world.stripe.intents.get(order.payment.id)).toMatchObject({
      status: "succeeded",
      amount_received: SERVICE_PRICES.newRegistration.cents,
      metadata: { order_id: order.reference, service_type: "newRegistration", application_id: filed.zulexApplicationId },
    })
    expect(emails()).toEqual(["submittedToKba"])
  })

  it("finishes from what Zulex returns and keeps the confirmation and the temporary certificate for the customer's downloads", async () => {
    const order = await verifiedOrder()
    await submitToKba(world.deps, order)
    const { zulexApplicationId } = await stored(order.reference)
    world.zulex.setStatus(zulexApplicationId!, "FINISHED", {
      documents: [
        { id: CONFIRMATION_ID, type: "REGISTRATION_CONFIRMATION" },
        { id: CERTIFICATE_ID, type: "TEMPORARY_REGISTRATION_CERTIFICATE" },
      ],
    })
    world.zulex.setDocument(CONFIRMATION_ID, new TextEncoder().encode("%PDF-fake-confirmation"))
    world.zulex.setDocument(CERTIFICATE_ID, new TextEncoder().encode("%PDF-fake-certificate"))

    world.clock.advance(HOUR)
    await pollDueApplications(world.deps, 50)

    expect((await stored(order.reference)).status).toBe("completed")
    expect(await world.deps.documents.list(order.reference)).toEqual(
      expect.arrayContaining([
        { id: CONFIRMATION_ID, kind: "confirmation" },
        { id: CERTIFICATE_ID, kind: "temporaryCertificate" },
      ]),
    )
    expect(new TextDecoder().decode((await world.deps.documents.get(order.reference, CERTIFICATE_ID))?.bytes)).toBe("%PDF-fake-certificate")
    expect(emails()).toEqual(["submittedToKba", "completed"])
  })
})
