import type { OrderableService } from "./service"
import { ConsentRequired } from "@/src/core/errors/application/consent-required"

/**
 * What the customer ticks before paying. `terms` is the AGB with the withdrawal notice, `earlyStart`
 * the waiver that lets the work begin before the withdrawal period ends (launch plan Q13), and
 * `powerOfAttorney` the authority to file in the customer's name (Q46).
 */
export type ConsentKind = "terms" | "earlyStart" | "powerOfAttorney"

/** Every service takes the first two; a service filed in the customer's name takes the power of attorney too. */
const REQUIRED: Record<OrderableService, readonly ConsentKind[]> = {
  deregistration: ["terms", "earlyStart"],
  newRegistration: ["terms", "earlyStart", "powerOfAttorney"],
}

/**
 * The version of each legal text the checkout shows, kept with the order as the proof of what the
 * customer agreed to. Both are drafts until the lawyer's texts replace the placeholders (launch plan
 * Q13, Q46, M7): change the version whenever the AGB page or a checkbox's wording changes, or an order
 * would claim consent to a text the customer never saw.
 */
export const LEGAL_TEXT_VERSIONS = { agb: "draft-1", powerOfAttorney: "draft-1" } as const

/** What an order keeps of the consent given at checkout (launch plan D9). */
export interface Consent {
  /** Of the AGB, the withdrawal notice and the early-start waiver, which are shown and accepted together. */
  readonly agbVersion: string
  /** Only for a service that files in the customer's name. */
  readonly powerOfAttorneyVersion?: string
  readonly givenAt: Date
}

/**
 * Takes what the browser says the customer ticked, and returns what the order keeps. Only the
 * boolean `true` counts, for each consent the service requires; anything else, or a missing one,
 * is `ConsentRequired`. A consent the service does not need is ignored, not stored.
 */
export function recordConsent(service: OrderableService, given: unknown, now: Date): Consent {
  const ticked = (kind: ConsentKind) => typeof given === "object" && given !== null && (given as Record<string, unknown>)[kind] === true
  if (!REQUIRED[service].every(ticked)) throw new ConsentRequired()

  return {
    agbVersion: LEGAL_TEXT_VERSIONS.agb,
    ...(REQUIRED[service].includes("powerOfAttorney") ? { powerOfAttorneyVersion: LEGAL_TEXT_VERSIONS.powerOfAttorney } : {}),
    givenAt: now,
  }
}
