import { z } from "zod"
import { validate } from "@/src/core/domain/validate"

/** What drives the car. The API's `NO_ENGINE` is left out: a car always has one. */
export const ENGINE_TYPES = ["electric", "hybrid", "combustion"] as const

export const engineTypeSchema = z.enum(ENGINE_TYPES)

export type EngineType = z.output<typeof engineTypeSchema>

/** Throws a `ValidationError` for `engineType`. */
export const parseEngineType = (input: unknown): EngineType => validate(engineTypeSchema, input, "engineType")
