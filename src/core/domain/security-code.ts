import { z } from "zod"
import { validate } from "./validate"

const LENGTHS = { rearPlate: 3, frontPlate: 3, certificate: 7 } as const

export type SecurityCodeKind = keyof typeof LENGTHS

const REDACTED = "[redacted security code]"

/**
 * A scratch-off code: legal proof of possession, so it is treated as a secret.
 * Every way an object is turned into text — String(), templates, JSON,
 * util.inspect (console.log) — prints a placeholder. Only `reveal()` returns the
 * code, for the adapters that must transmit or store it.
 */
export class SecurityCode {
  readonly #value: string

  private constructor(
    readonly kind: SecurityCodeKind,
    value: string,
  ) {
    this.#value = value
  }

  /** For composing into larger schemas, such as a whole de-registration request. */
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
