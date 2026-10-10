import { InvalidTransition } from "@/src/core/errors/application/invalid-transition"
import type { Service } from "./service"

export const APPLICATION_STATUSES = [
  "awaiting_payment",
  "submitted_and_paid",
  "awaiting_identity_verification",
  "identity_verified",
  "submitted_to_kba",
  "completed",
  "failed_correctable",
  "failed_final",
  "cancelled",
] as const

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export const APPLICATION_EVENTS = [
  "paymentConfirmed",
  "identityVerificationStarted",
  "identityVerified",
  "identityVerificationFailed",
  "identityVerificationExpired",
  "submittedToKba",
  "kbaCompleted",
  "failedCorrectable",
  "failedFinal",
  "correctionResubmitted",
  "correctionRefiled",
  "correctionRechecked",
  "cancelledByCustomer",
] as const

export type ApplicationEvent = (typeof APPLICATION_EVENTS)[number]

type Moves = Partial<Record<ApplicationEvent, ApplicationStatus>>
type Path = Record<ApplicationStatus, Moves>

const AT_THE_KBA: Pick<Path, "submitted_to_kba" | "completed" | "failed_final" | "cancelled"> = {
  submitted_to_kba: {
    kbaCompleted: "completed",
    failedCorrectable: "failed_correctable",
    failedFinal: "failed_final",
  },
  completed: {},
  failed_final: {},
  cancelled: {},
}

const DIRECT: Path = {
  awaiting_payment: {
    paymentConfirmed: "submitted_and_paid",
  },
  submitted_and_paid: {
    submittedToKba: "submitted_to_kba",
    failedCorrectable: "failed_correctable",
    failedFinal: "failed_final",
  },
  awaiting_identity_verification: {},
  identity_verified: {},
  failed_correctable: {
    correctionResubmitted: "submitted_to_kba",
    correctionRefiled: "submitted_and_paid",
    cancelledByCustomer: "cancelled",
  },
  ...AT_THE_KBA,
}

// Provisional: launch plan Q45 (verify first), Q47 (owner mismatch is correctable), Q48 (expiry cancels)
const VERIFIED: Path = {
  awaiting_payment: {
    paymentConfirmed: "submitted_and_paid",
  },
  submitted_and_paid: {
    identityVerificationStarted: "awaiting_identity_verification",
    failedFinal: "failed_final",
  },
  awaiting_identity_verification: {
    identityVerified: "identity_verified",
    identityVerificationFailed: "failed_final",
    identityVerificationExpired: "cancelled",
    failedCorrectable: "failed_correctable",
  },
  identity_verified: {
    submittedToKba: "submitted_to_kba",
    failedCorrectable: "failed_correctable",
    failedFinal: "failed_final",
  },
  failed_correctable: {
    correctionResubmitted: "submitted_to_kba",
    correctionRefiled: "identity_verified",
    correctionRechecked: "awaiting_identity_verification",
    cancelledByCustomer: "cancelled",
  },
  ...AT_THE_KBA,
}

// Provisional: launch plan Q4. An opt-out list, so a new service is identity-checked unless named here.
const DIRECT_SERVICES: readonly Service[] = ["deregistration"]

export const requiresIdentityVerification = (service: Service): boolean => !DIRECT_SERVICES.includes(service)

const pathOf = (service: Service): Path => (requiresIdentityVerification(service) ? VERIFIED : DIRECT)

export const filedFrom = (service: Service): ApplicationStatus => (requiresIdentityVerification(service) ? "identity_verified" : "submitted_and_paid")

export interface Journey {
  readonly service: Service
  readonly identityVerified: boolean
}

const AFTER_VERIFICATION: readonly ApplicationEvent[] = ["submittedToKba", "correctionResubmitted", "correctionRefiled"]

const BEFORE_VERIFICATION: readonly ApplicationEvent[] = ["correctionRechecked"]

export function advance(status: ApplicationStatus, event: ApplicationEvent, { service, identityVerified }: Journey): ApplicationStatus {
  const next = pathOf(service)[status][event]
  const refused = requiresIdentityVerification(service) && (identityVerified ? BEFORE_VERIFICATION : AFTER_VERIFICATION).includes(event)
  if (!next || refused) throw new InvalidTransition(status, event)
  return next
}

export const OPEN_STATUSES: readonly ApplicationStatus[] = [
  "submitted_and_paid",
  "awaiting_identity_verification",
  "identity_verified",
  "submitted_to_kba",
  "failed_correctable",
]

export const POLLED_STATUSES: readonly ApplicationStatus[] = [
  "submitted_and_paid",
  "awaiting_identity_verification",
  "identity_verified",
  "submitted_to_kba",
  "failed_correctable",
]

export const isTerminal = (status: ApplicationStatus): boolean =>
  [DIRECT, VERIFIED].every((path) => Object.keys(path[status]).length === 0)
