import type { Stage } from "@/src/config/env"
import { DuplicateApplication } from "@/src/core/errors/duplicate-application"
import type { ApplicationRepository } from "@/src/core/ports/application-repository"
import { SEEDED_APPLICATIONS, type SeededApplication } from "./data/applications"

/**
 * The same applications, one or more per status, for dev and staging: dev
 * loads them into the in-memory repository at every boot, staging into its
 * database on every deploy (`npm run db:seed`). Production is never seeded.
 */
export function seedFor(stage: Stage): readonly SeededApplication[] {
  if (stage === "production") throw new Error("The seed never loads in production.")
  return SEEDED_APPLICATIONS
}

/**
 * Adds each seeded application that is missing and returns how many it added.
 * One already there is left as it is, so someone testing on staging does not
 * lose their changes to the next deploy. Its status link is set either way.
 */
export async function loadSeed(repository: ApplicationRepository, seed: readonly SeededApplication[]): Promise<number> {
  let added = 0
  for (const { application, statusToken } of seed) {
    try {
      await repository.create(application)
      added += 1
    } catch (error) {
      if (!(error instanceof DuplicateApplication && error.field === "reference")) throw error
    }
    await repository.setStatusToken(application.reference, statusToken)
  }
  return added
}
