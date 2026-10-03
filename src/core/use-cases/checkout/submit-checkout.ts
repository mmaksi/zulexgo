import type { Application } from "@/src/core/domain/application/application"
import { referenceFromToken } from "@/src/core/domain/application/application-reference"
import { parseDeregistrationRequest } from "@/src/core/domain/application/deregistration-request"
import { emailSchema } from "@/src/core/domain/customer/email"
import { DEREGISTRATION_TOTAL } from "@/src/core/domain/payment/pricing"
import { combinedIkfzStatus } from "@/src/core/domain/registration/registration-authority"
import { validate } from "@/src/core/domain/validate"
import { DuplicateApplication } from "@/src/core/errors/application/duplicate-application"
import { OpenApplicationExists } from "@/src/core/errors/application/open-application-exists"
import type { Dependencies } from "@/src/core/use-cases/dependencies"

/** Tries at a free reference: they are short, so a clash is plausible, three in a row are not. */
const REFERENCE_ATTEMPTS = 3

/**
 * The customer presses "pay": store the details (payment is confirmed later,
 * by webhook) and open a payment the browser confirms with `clientSecret`.
 *
 * J8: the same plate and VIN with a paid order still open would be filed
 * twice, and the KBA rejects the second, so the customer is warned first and
 * goes on only by saying so (`acknowledgedDuplicate`). An earlier checkout that
 * was never paid does not count: a refresh must not block the customer.
 *
 * Creates the order at `awaiting_payment`: no status link and no email yet, those follow
 * when the provider reports the payment (`confirmPayment`). Everything arrives untrusted
 * from the browser, so a malformed request or email is a `ValidationError`; a duplicate that
 * the customer has not acknowledged is `OpenApplicationExists`. A registration service
 * outage on the authority lookup propagates and nothing is stored or opened.
 */
export async function submitCheckout(
  deps: Dependencies,
  input: { request: unknown; email: unknown; acknowledgedDuplicate?: boolean },
): Promise<{ reference: Application["reference"]; clientSecret: string }> {
  const request = parseDeregistrationRequest(input.request)
  const email = validate(emailSchema, input.email, "email")
  // Says only that an order is open, never which.
  if (!input.acknowledgedDuplicate && (await deps.repository.hasOpenApplication(request))) throw new OpenApplicationExists()
  // Stored on the order: it decides when the card is captured and how often the KBA is asked.
  const ikfzStatus = combinedIkfzStatus(await deps.registration.findAuthorities(request.licencePlate.prefix))

  for (let attempt = 1; ; attempt++) {
    const reference = referenceFromToken(deps.tokens.generate())
    // The payment is opened first because the order stores its id. A reference that then
    // proves taken leaves an unpaid payment behind that nobody holds the secret of.
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
      // Only a reference clash is retried, with a new reference. A clash on the idempotency key, a
      // full-length random token, is not expected, so it surfaces like any other failure.
      const referenceTaken = error instanceof DuplicateApplication && error.field === "reference"
      if (!referenceTaken || attempt === REFERENCE_ATTEMPTS) throw error
    }
  }
}
