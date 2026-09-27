import type { Stage } from "@/src/config/env"
import { SEEDED_APPLICATIONS, type SeededApplication } from "./data/applications"

/**
 * Dev data for the in-memory repository, loaded by the composition root at
 * boot: the same applications on every restart, one or more per status.
 * Staging and production are never seeded.
 */
export function devSeed(stage: Stage): readonly SeededApplication[] {
  if (stage !== "dev") throw new Error(`The seed loads only when APP_ENV is dev, not ${stage}.`)
  return SEEDED_APPLICATIONS
}
