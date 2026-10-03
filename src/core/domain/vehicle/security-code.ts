import { z } from "zod"
import { validate } from "@/src/core/domain/validate"

/** Characters per code: a plate seal hides three, the registration certificate (Teil I) seven. */
const LENGTHS = { rearPlate: 3, frontPlate: 3, certificate: 7 } as const

/** The rear and front plate seals and the registration certificate, each with its own length. */
export type SecurityCodeKind = keyof typeof LENGTHS

const REDACTED = "[redacted security code]"

/**
 * A scratch-off code: legal proof of possession, so it is treated as a secret.
 * Every way an object is turned into text — String(), templates, JSON,
 * util.inspect (console.log) — prints a placeholder. Only `reveal()` returns the
 * code, for the adapters that must transmit or store it.
 */
export class SecurityCode {
  // A true private field, not TypeScript `private`: reflection and object spreads cannot reach it.
  readonly #value: string

  private constructor(
    readonly kind: SecurityCodeKind,
    value: string,
  ) {
    this.#value = value
  }

  /**
   * For composing into larger schemas, such as a whole de-registration request. Trims the input,
   * then takes exactly the kind's length of letters and digits, case kept as typed; the output
   * is a `SecurityCode`, never a plain string.
   */
  static schema(kind: SecurityCodeKind) {
    return z
      .string()
      .trim()
      .regex(new RegExp(`^[0-9A-Za-z]{${LENGTHS[kind]}}$`))
      .transform((value) => new SecurityCode(kind, value))
  }

  /** Throws a `ValidationError` naming the kind, never the input. */
  static parse(kind: SecurityCodeKind, input: unknown): SecurityCode {
    return validate(SecurityCode.schema(kind), input, kind)
  }

  /**
   * The only way to read the code: for the registration adapter that sends it and the repository
   * adapter that stores it encrypted. Never log it, render it or put it in an email.
   */
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
