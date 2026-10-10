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

export interface Dependencies {
  readonly repository: ApplicationRepository
  readonly registration: RegistrationGateway
  readonly payments: PaymentProvider
  readonly identity: IdentityVerification
  readonly mailer: Mailer
  readonly documents: DocumentStore
  readonly rateLimiter: RateLimiter
  readonly clock: Clock
  readonly tokens: TokenGenerator
  readonly statusLink: (token: string) => string
  readonly errorCatalogue?: RejectionCatalogue
  readonly servicesOnSale: readonly OrderableService[]
  readonly beta?: Beta
}
