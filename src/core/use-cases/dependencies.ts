import type { ErrorCatalogue } from "@/src/core/domain/error-algorithm"
import type { ApplicationRepository } from "@/src/core/ports/application-repository"
import type { Clock } from "@/src/core/ports/clock"
import type { DocumentStore } from "@/src/core/ports/document-store"
import type { Mailer } from "@/src/core/ports/mailer"
import type { PaymentProvider } from "@/src/core/ports/payment-provider"
import type { RateLimiter } from "@/src/core/ports/rate-limiter"
import type { RegistrationGateway } from "@/src/core/ports/registration-gateway"
import type { TokenGenerator } from "@/src/core/ports/token-generator"

/** Everything a use case may touch, handed in by the composition root or a test. */
export interface Dependencies {
  readonly repository: ApplicationRepository
  readonly registration: RegistrationGateway
  readonly payments: PaymentProvider
  readonly mailer: Mailer
  readonly documents: DocumentStore
  readonly rateLimiter: RateLimiter
  readonly clock: Clock
  readonly tokens: TokenGenerator
  /** Turns a status token into the absolute link the customer receives. */
  readonly statusLink: (token: string) => string
  readonly errorCatalogue?: ErrorCatalogue
}
