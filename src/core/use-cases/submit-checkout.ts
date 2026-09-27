import type { Application } from "@/src/core/domain/application"
import { referenceFromToken } from "@/src/core/domain/application-reference"
import { parseDeregistrationRequest } from "@/src/core/domain/deregistration-request"
import { emailSchema } from "@/src/core/domain/email"
import { DEREGISTRATION_TOTAL } from "@/src/core/domain/pricing"
import { combinedIkfzStatus } from "@/src/core/domain/registration-authority"
import { validate } from "@/src/core/domain/validate"
import { DuplicateApplication } from "@/src/core/errors/duplicate-application"
import type { Dependencies } from "./dependencies"

const REFERENCE_ATTEMPTS = 3

/**
 * The customer presses "pay": store the details (payment is confirmed later,
 * by webhook) and open a payment the browser confirms with `clientSecret`.
 */
export async function submitCheckout(
  deps: Dependencies,
  input: { request: unknown; email: unknown },
): Promise<{ reference: Application["reference"]; clientSecret: string }> {
  const request = parseDeregistrationRequest(input.request)
  const email = validate(emailSchema, input.email, "email")
  const ikfzStatus = combinedIkfzStatus(await deps.registration.findAuthorities(request.licencePlate.prefix))

  for (let attempt = 1; ; attempt++) {
    const reference = referenceFromToken(deps.tokens.generate())
    const { paymentId, clientSecret } = await deps.payments.createPayment({ reference, amount: DEREGISTRATION_TOTAL, email })
    const now = deps.clock.now()
    try {
      await deps.repository.create({
        reference,
        version: 0,
        status: "awaiting_payment",
        history: [{ status: "awaiting_payment", at: now }],
        request,
        email,
        ikfzStatus,
        idempotencyKey: deps.tokens.generate(),
        payment: { id: paymentId, total: DEREGISTRATION_TOTAL },
        retryAttempts: 0,
        polling: { attempts: 0 },
      })
      return { reference, clientSecret }
    } catch (error) {
      const referenceTaken = error instanceof DuplicateApplication && error.field === "reference"
      if (!referenceTaken || attempt === REFERENCE_ATTEMPTS) throw error
    }
  }
}
