import type { z } from "zod"

// Personal data or proof of possession: must not reach a log, an email, a status page or a URL.
export class Secret<T> {
  readonly #value: T
  readonly #placeholder: string

  constructor(value: T, label: string) {
    this.#value = value
    this.#placeholder = `[redacted ${label}]`
  }

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

export const secret = <Schema extends z.ZodType>(schema: Schema, label: string) =>
  schema.transform((value) => new Secret<z.output<Schema>>(value, label))
