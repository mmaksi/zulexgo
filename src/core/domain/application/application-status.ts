import { InvalidTransition } from "@/src/core/errors/application/invalid-transition"
import type { Service } from "./service"

/**
 * Our status machine, not the Zulex one: the API only knows IN_PROGRESS,
 * FINISHED and ERROR. Order is the customer's journey, so the stepper can
 * render from this list.
 *
 * Against the business logic numbering: `submitted_and_paid` is 1,
 * `awaiting_identity_verification` is 2, `identity_verified` is 3, `submitted_to_kba` is 4,
 * `completed` is 5a, `failed_correctable` is 5b and `failed_final` is 5c. `cancelled` is a
 * 5b the customer gave up on, or an identity verification that ran out. Statuses 2 and 3 belong to
 * the services that verify the customer's identity before anything is filed (`requiresIdentityVerification`);
 * the others go from 1 to 4.
 *
 * `awaiting_payment` is ours alone: the details are stored at checkout because
 * Stripe confirms payment later, by webhook. The customer never sees it — the
 * status link is only issued once payment is confirmed — and it sends no email.
 */
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

/**
 * What happened, already classified. The one silent retry of a technical error
 * is not an event: the customer sees nothing until the error algorithm decides.
 *
 * A correction reaches the KBA again by one of two ways: `correctionResubmitted`
 * patches an application the service already holds (back to status 4);
 * `correctionRefiled` files an application the service refused outright, and
 * so never held, like a new submission (back to status 1, or to 3 for a service
 * whose identity is already verified).
 *
 * The `identityVerification…` events are the verification's own: it started (the customer was
 * sent to verify), it succeeded, it failed (not the customer's data: 5c), or its deadline passed
 * (the order is cancelled). A verification that succeeds with a different person than the order
 * names is a `failedCorrectable`, since nothing was filed and the customer can fix the name;
 * `correctionRechecked` then sends the order back to be checked again, and is the only way on
 * for it, since nothing may file or patch an order whose identity was never verified.
 *
 * `kbaProcessing` is the one event that keeps the status (still at the KBA), so it
 * adds nothing to the history.
 */
export const APPLICATION_EVENTS = [
  "paymentConfirmed",
  "identityVerificationStarted",
  "identityVerified",
  "identityVerificationFailed",
  "identityVerificationExpired",
  "submittedToKba",
  "kbaProcessing",
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

/**
 * From the KBA onwards every service moves the same way. A status with no moves in a path is
 * terminal there, or unreachable on it.
 */
const AT_THE_KBA: Pick<Path, "submitted_to_kba" | "completed" | "failed_final" | "cancelled"> = {
  submitted_to_kba: {
    kbaProcessing: "submitted_to_kba",
    kbaCompleted: "completed",
    failedCorrectable: "failed_correctable",
    failedFinal: "failed_final",
  },
  completed: {},
  failed_final: {},
  cancelled: {},
}

/**
 * Paid, then straight to the KBA (de-registration, launch plan Q4). Every legal move and nothing
 * else: an event a status has no entry for is refused. A submission refused before the KBA held the
 * application fails from `submitted_and_paid` directly. The customer can cancel from
 * `failed_correctable` only.
 */
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

/**
 * Paid, then verified, then to the KBA (Neuzulassung, launch plan Q45, provisional). Nothing reaches the
 * KBA before 3, so a submission refused outright fails from `identity_verified`, and a refiled order
 * returns there: its identity was verified once and does not need to be again. A verification that
 * ends without success takes the order to 5c (failed), to 5b (the person verified is not the owner on
 * the order, launch plan Q47, provisional) or to `cancelled` (the deadline passed, Q48, provisional).
 * A verification that cannot be started at all fails the order from status 1, as an unconfirmed
 * filing does for a service that goes straight to the KBA.
 *
 * Which exits of 5b an order may take depends on whether its identity was ever verified, which the
 * table cannot say: `advance` applies `AFTER_VERIFICATION` and `BEFORE_VERIFICATION`.
 */
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

/**
 * The services that go straight from payment to the KBA (de-registration, launch plan Q4, provisional). Every
 * other service verifies the customer's identity first: the KBA registers a car in a named person's name, so a
 * service added later must opt out of the check deliberately, never skip it by being left off a list.
 */
const DIRECT_SERVICES: readonly Service[] = ["deregistration"]

export const requiresIdentityVerification = (service: Service): boolean => !DIRECT_SERVICES.includes(service)

const pathOf = (service: Service): Path => (requiresIdentityVerification(service) ? VERIFIED : DIRECT)

/** The status an order of `service` is filed from: paid (1) when it goes straight to the KBA, identity verified (3) otherwise. */
export const filedFrom = (service: Service): ApplicationStatus => (requiresIdentityVerification(service) ? "identity_verified" : "submitted_and_paid")

/** What `advance` needs of an order besides its status. */
export interface Journey {
  readonly service: Service
  /** Whether the order has been at `identity_verified`: it is when the order's history says so, and then it stays so. */
  readonly identityVerified: boolean
}

/** Events that lead on towards the KBA, so an order whose identity was never verified may not take them. */
const AFTER_VERIFICATION: readonly ApplicationEvent[] = ["submittedToKba", "correctionResubmitted", "correctionRefiled"]

/** Events that send an order to be verified again, which one already verified never needs. */
const BEFORE_VERIFICATION: readonly ApplicationEvent[] = ["correctionRechecked"]

/**
 * The status an event leads to for an order on `journey`. Throws `InvalidTransition` when the
 * status does not accept the event, which is how a cancel or a correction on an order that is not
 * at 5b is refused, and a verification event on a service that does not verify. For a service that
 * does verify, an order whose identity was never verified is refused every move towards the KBA,
 * wherever it stands (a 5b caused by a verification mismatch is such an order), and one that was
 * verified is refused a second verification.
 */
export function advance(status: ApplicationStatus, event: ApplicationEvent, { service, identityVerified }: Journey): ApplicationStatus {
  const next = pathOf(service)[status][event]
  const refused = requiresIdentityVerification(service) && (identityVerified ? BEFORE_VERIFICATION : AFTER_VERIFICATION).includes(event)
  if (!next || refused) throw new InvalidTransition(status, event)
  return next
}

/**
 * Paid and not finished: the orders a second order for the same vehicle would collide with (J8).
 * Status 3 counts as status 1 does: an order interrupted between verification and filing is still open.
 */
export const OPEN_STATUSES: readonly ApplicationStatus[] = [
  "submitted_and_paid",
  "awaiting_identity_verification",
  "identity_verified",
  "submitted_to_kba",
  "failed_correctable",
]

/**
 * Looked at on a schedule: waiting for a silent resubmission, waiting for the customer to verify
 * (the deadline, the reminder and the card hold), verified and not yet filed (so filing is resumed
 * if it was interrupted), at the KBA, or (5b) waiting for the customer while the money is watched.
 * The repositories' `findDueForPolling` returns applications in these statuses only.
 */
export const POLLED_STATUSES: readonly ApplicationStatus[] = [
  "submitted_and_paid",
  "awaiting_identity_verification",
  "identity_verified",
  "submitted_to_kba",
  "failed_correctable",
]

/** No event moves it on, on any path: completed, failed for good, or cancelled. */
export const isTerminal = (status: ApplicationStatus): boolean =>
  [DIRECT, VERIFIED].every((path) => Object.keys(path[status]).length === 0)
