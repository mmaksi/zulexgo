/**
 * Base of every error the core throws, so adapters and routes can map them without knowing
 * each one. A message must never carry a secret, such as a security code or a status token:
 * it can end up in a log (see `ValidationError` and `TokenInvalid`).
 */
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message)
    // Callers log an error by its name alone, so the name must say which rule was broken.
    this.name = new.target.name
  }
}
