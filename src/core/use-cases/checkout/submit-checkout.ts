import type { Application } from "@/src/core/domain/application/application"
import { referenceFromToken } from "@/src/core/domain/application/application-reference"
import { recordConsent } from "@/src/core/domain/application/consent"
import { isOrderable, parseServiceRequest, type ServiceRequest } from "@/src/core/domain/application/service"
import { emailSchema } from "@/src/core/domain/customer/email"
import { SERVICE_PRICES } from "@/src/core/domain/payment/pricing"
import { combinedIkfzStatus } from "@/src/core/domain/registration/registration-authority"
import { validate } from "@/src/core/domain/validate"
import { DuplicateApplication } from "@/src/core/errors/application/duplicate-application"
import { OpenApplicationExists } from "@/src/core/errors/application/open-application-exists"
import { ServiceNotOnSale } from "@/src/core/errors/application/service-not-on-sale"
import { requireInvite, takeBetaPlace } from "@/src/core/use-cases/checkout/beta-access"
import type { Dependencies } from "@/src/core/use-cases/dependencies"

function authorityOf(request: ServiceRequest) {
  switch (request.service) {
    case "deregistration":
      return { where: { prefix: request.licencePlate.prefix }, invalidField: "licencePlate.prefix" }
    case "newRegistration":
      return { where: { postcode: request.owner.address.reveal().postcode }, invalidField: "owner.address.postcode" }
  }
}

const REFERENCE_ATTEMPTS = 3

// Server actions take any POST: this, not the landing page, gates what is on sale.
export async function submitCheckout(
  deps: Dependencies,
  input: { service: unknown; request: unknown; email: unknown; consents: unknown; invite?: unknown; acknowledgedDuplicate?: boolean },
): Promise<{ reference: Application["reference"]; clientSecret: string }> {
  const onSale: readonly unknown[] = deps.servicesOnSale
  if (!isOrderable(input.service) || !onSale.includes(input.service)) throw new ServiceNotOnSale()
  requireInvite(deps, input.service, input.invite)
  const takenAt = deps.clock.now()
  const consent = recordConsent(input.service, input.consents, takenAt)
  const request = parseServiceRequest(input.service, input.request, takenAt)
  const email = validate(emailSchema, input.email, "email")
  if (!input.acknowledgedDuplicate && (await deps.repository.hasOpenApplication(request))) throw new OpenApplicationExists()
  const { where, invalidField } = authorityOf(request)
  const ikfzStatus = combinedIkfzStatus(await deps.registration.findAuthorities(where), invalidField)
  const total = SERVICE_PRICES[request.service]
  // Last of the checks: the limiter cannot give a beta place back.
  await takeBetaPlace(deps, request.service)

  for (let attempt = 1; ; attempt++) {
    const reference = referenceFromToken(deps.tokens.generate())
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
      const referenceTaken = error instanceof DuplicateApplication && error.field === "reference"
      if (!referenceTaken || attempt === REFERENCE_ATTEMPTS) throw error
    }
  }
}
