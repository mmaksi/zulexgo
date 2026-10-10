// A message must never carry a secret, such as a security code or a status token: it can reach a log.
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}
