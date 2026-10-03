import type { z } from "zod"

/**
 * Personal data or proof of possession that must not reach a log, an email, a status page or a
 * URL: an IBAN, a birth date, a Teil II code. Every way an object is turned into text (String(),
 * templates, JSON, util.inspect and so console.log) prints a placeholder that names the field and
 * nothing else. Only `reveal()` returns the value, for the adapters that must transmit or store it.
 */
export class Secret<T> {
  // True private fields, not TypeScript `private`: reflection and object spreads cannot reach them.
  readonly #value: T
  readonly #placeholder: string

  constructor(value: T, label: string) {
    this.#value = value
    this.#placeholder = `[redacted ${label}]`
  }

  /** Never log it, render it or put it in an email. */
  reveal(): T {
    return this.#value
  }

  toString(): string {
    return this.#placeholder
  }

  toJSON(): string {
    return this.#placeholder
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return this.#placeholder
  }
}

/** Wraps what a schema produces in a `Secret`, so a field is secret by how it is parsed. */
export const secret = <Schema extends z.ZodType>(schema: Schema, label: string) =>
  schema.transform((value) => new Secret<z.output<Schema>>(value, label))
