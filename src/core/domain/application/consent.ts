import type { OrderableService } from "./service"
import { ConsentRequired } from "@/src/core/errors/application/consent-required"

// Provisional: launch plan Q13 (earlyStart waiver), Q46 (powerOfAttorney)
export type ConsentKind = "terms" | "earlyStart" | "powerOfAttorney"

const REQUIRED: Record<OrderableService, readonly ConsentKind[]> = {
  deregistration: ["terms", "earlyStart"],
  newRegistration: ["terms", "earlyStart", "powerOfAttorney"],
}

// Drafts until the lawyer's texts (Q13, Q46); bump on any AGB or checkbox wording change.
export const LEGAL_TEXT_VERSIONS = { agb: "draft-1", powerOfAttorney: "draft-1" } as const

export interface Consent {
  readonly agbVersion: string
  readonly powerOfAttorneyVersion?: string
  readonly givenAt: Date
}

export function recordConsent(service: OrderableService, given: unknown, now: Date): Consent {
  const ticked = (kind: ConsentKind) => typeof given === "object" && given !== null && (given as Record<string, unknown>)[kind] === true
  if (!REQUIRED[service].every(ticked)) throw new ConsentRequired()

  return {
    agbVersion: LEGAL_TEXT_VERSIONS.agb,
    ...(REQUIRED[service].includes("powerOfAttorney") ? { powerOfAttorneyVersion: LEGAL_TEXT_VERSIONS.powerOfAttorney } : {}),
    givenAt: now,
  }
}
