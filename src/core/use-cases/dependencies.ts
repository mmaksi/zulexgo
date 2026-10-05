import type { Beta } from "@/src/core/domain/application/beta"
import type { OrderableService } from "@/src/core/domain/application/service"
import type { RejectionCatalogue } from "@/src/core/domain/registration/rejection-catalogue"
import type { ApplicationRepository } from "@/src/core/ports/repository/application-repository"
import type { Clock } from "@/src/core/ports/clock/clock"
import type { IdentityVerification } from "@/src/core/ports/identity/identity-verification"
import type { DocumentStore } from "@/src/core/ports/storage/document-store"
import type { Mailer } from "@/src/core/ports/mail/mailer"
import type { PaymentProvider } from "@/src/core/ports/payment/payment-provider"
import type { RateLimiter } from "@/src/core/ports/rate-limit/rate-limiter"
import type { RegistrationGateway } from "@/src/core/ports/registration/registration-gateway"
import type { TokenGenerator } from "@/src/core/ports/tokens/token-generator"

/**
 * Everything a use case may touch, handed in by the composition root or a test.
 * Use cases name the ports they use, never a vendor: the adapter behind each one is
 * chosen per stage (`APP_ENV`), so the same code runs on fakes in tests and dev.
 * A use case that needs only part of this takes a `Pick` of it.
 */
export interface Dependencies {
  readonly repository: ApplicationRepository
  readonly registration: RegistrationGateway
  readonly payments: PaymentProvider
  /** Proves who a customer is, for the services that verify before anything is filed. */
  readonly identity: IdentityVerification
  readonly mailer: Mailer
  readonly documents: DocumentStore
  /**
   * Bounds the entry points that take a status link or an address (status page, downloads,
   * cancel, correct, resend a link; `limitResend` is the one use case that counts) and the
   * Neuzulassung funnel's two server actions, the postcode check and the checkout (counted in
   * `app/(funnel)/register/requests.ts`). The payment, filing and polling flow is not rate limited.
   */
  readonly rateLimiter: RateLimiter
  /** The only source of "now": hold expiry, poll schedules and history timestamps all read it. */
  readonly clock: Clock
  /** Status links, idempotency keys and the random part of order references. */
  readonly tokens: TokenGenerator
  /** Turns a status token into the absolute link the customer receives. */
  readonly statusLink: (token: string) => string
  /**
   * Replaces the KBA error-code table (`REJECTION_CATALOGUE`) for the error algorithm and the
   * customer wording. The composition root leaves it unset, so the table in the domain
   * applies; tests set it to exercise codes the real table does not list yet.
   */
  readonly errorCatalogue?: RejectionCatalogue
  /**
   * What checkout takes an order for (`SERVICES_ON_SALE`, set per stage): a service that is not listed is
   * refused, whatever the landing page shows. Tests list the services they place orders for.
   */
  readonly servicesOnSale: readonly OrderableService[]
  /**
   * The services in their beta, with the invite codes that open each. Unset when no service is: everything
   * on sale is open to everyone.
   */
  readonly beta?: Beta
}
