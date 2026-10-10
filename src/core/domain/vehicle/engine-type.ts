import { z } from "zod"

// The API's `NO_ENGINE` is left out: a car always has one.
export const ENGINE_TYPES = ["electric", "hybrid", "combustion"] as const

export const engineTypeSchema = z.enum(ENGINE_TYPES)

export type EngineType = z.output<typeof engineTypeSchema>
