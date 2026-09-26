/** Base of every error the core throws, so adapters and routes can map them without knowing each one. */
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}
