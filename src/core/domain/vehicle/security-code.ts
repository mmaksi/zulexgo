import { z } from "zod"
import { validate } from "@/src/core/domain/validate"

const LENGTHS = { rearPlate: 3, frontPlate: 3, certificate: 7 } as const

export type SecurityCodeKind = keyof typeof LENGTHS

const REDACTED = "[redacted security code]"

// Legal proof of possession: must never reach a log, an email or a status page.
export class SecurityCode {
  readonly #value: string

  private constructor(
    readonly kind: SecurityCodeKind,
    value: string,
  ) {
    this.#value = value
  }

  static schema(kind: SecurityCodeKind) {
    return z
      .string()
      .trim()
      .regex(new RegExp(`^[0-9A-Za-z]{${LENGTHS[kind]}}$`))
      .transform((value) => new SecurityCode(kind, value))
  }

  static parse(kind: SecurityCodeKind, input: unknown): SecurityCode {
    return validate(SecurityCode.schema(kind), input, kind)
  }

  reveal(): string {
    return this.#value
  }

  toString(): string {
    return REDACTED
  }

  toJSON(): string {
    return REDACTED
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return REDACTED
  }
}
