import type { Application } from "@/src/core/domain/application/application"
import { referenceFromToken } from "@/src/core/domain/application/application-reference"
import { recordConsent } from "@/src/core/domain/application/consent"
import { isOrderable, parseServiceRequest, SERVICES_ON_SALE, type ServiceRequest } from "@/src/core/domain/application/service"
import { emailSchema } from "@/src/core/domain/customer/email"
import { SERVICE_PRICES } from "@/src/core/domain/payment/pricing"
import { combinedIkfzStatus } from "@/src/core/domain/registration/registration-authority"
import { validate } from "@/src/core/domain/validate"
import { DuplicateApplication } from "@/src/core/errors/application/duplicate-application"
import { OpenApplicationExists } from "@/src/core/errors/application/open-application-exists"
import { ServiceNotOnSale } from "@/src/core/errors/application/service-not-on-sale"
import type { Dependencies } from "@/src/core/use-cases/dependencies"

/**
 * Where the authority for an order is found, and the field to blame when none answers. A
 * de-registration keeps the authority of its plate; a car is registered where its keeper lives.
 */
function authorityOf(request: ServiceRequest) {
  switch (request.service) {
    case "deregistration":
      return { where: { prefix: request.licencePlate.prefix }, invalidField: "licencePlate.prefix" }
    case "newRegistration":
      return { where: { postcode: request.owner.address.reveal().postcode }, invalidField: "owner.address.postcode" }
  }
}

/** Tries at a free reference: they are short, so a clash is plausible, three in a row are not. */
const REFERENCE_ATTEMPTS = 3

/**
 * The customer presses "pay": store the details (payment is confirmed later,
 * by webhook) and open a payment the browser confirms with `clientSecret`.
 *
 * `service` is what the funnel sells, and only a service on sale is taken: a funnel's server
 * action is reachable by any POST, so this is the gate, not the landing page. So is `consents`,
 * what the customer ticked: without every one the service requires nothing is opened (launch plan
 * D9), and what was agreed to, with the version of each text, is kept on the order.
 *
 * J8: the same plate and VIN with a paid order still open would be filed
 * twice, and the KBA rejects the second, so the customer is warned first and
 * goes on only by saying so (`acknowledgedDuplicate`). An earlier checkout that
 * was never paid does not count: a refresh must not block the customer.
 *
 * Creates the order at `awaiting_payment`: no status link and no email yet, those follow
 * when the provider reports the payment (`confirmPayment`). Everything arrives untrusted
 * from the browser, so a service that is not on sale is `ServiceNotOnSale`, a missing consent
 * is `ConsentRequired`, a malformed request or email is a `ValidationError`, and a duplicate that
 * the customer has not acknowledged is `OpenApplicationExists`. A registration service outage on the authority
 * lookup propagates and nothing is stored or opened.
 */
export async function submitCheckout(
  deps: Dependencies,
  input: { service: unknown; request: unknown; email: unknown; consents: unknown; acknowledgedDuplicate?: boolean },
): Promise<{ reference: Application["reference"]; clientSecret: string }> {
  const onSale: readonly unknown[] = deps.servicesOnSale ?? SERVICES_ON_SALE
  if (!isOrderable(input.service) || !onSale.includes(input.service)) throw new ServiceNotOnSale()
  const takenAt = deps.clock.now()
  const consent = recordConsent(input.service, input.consents, takenAt)
  const request = parseServiceRequest(input.service, input.request, takenAt)
  const email = validate(emailSchema, input.email, "email")
  // Says only that an order is open, never which.
  if (!input.acknowledgedDuplicate && (await deps.repository.hasOpenApplication(request))) throw new OpenApplicationExists()
  // Stored on the order: it decides when the card is captured and how often the KBA is asked.
  const { where, invalidField } = authorityOf(request)
  const ikfzStatus = combinedIkfzStatus(await deps.registration.findAuthorities(where), invalidField)
  const total = SERVICE_PRICES[request.service]

  for (let attempt = 1; ; attempt++) {
    const reference = referenceFromToken(deps.tokens.generate())
    // The payment is opened first because the order stores its id. A reference that then
    // proves taken leaves an unpaid payment behind that nobody holds the secret of.
    const { paymentId, clientSecret } = await deps.payments.createPayment({ reference, service: request.service, amount: total, email })
    const now = deps.clock.now()
    try {
      await deps.repository.create({
        reference,
        version: 0,
        status: "awaiting_payment",
        history: [{ status: "awaiting_payment", at: now }],
        request,
        email,
        consent,
        ikfzStatus,
        idempotencyKey: deps.tokens.generate(),
        payment: { id: paymentId, total },
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
