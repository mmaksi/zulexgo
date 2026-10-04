import type { ServiceRequest } from "@/src/core/domain/application/service"

/**
 * What the customer typed that must stay out of a log, an error, a rendered page or an email: a
 * de-registration's security codes, everything a Neuzulassung's owner and car papers carry. Read
 * from the request, so a test asserts on the value that was entered, not on a second copy of it.
 */
export function secretsOf(request: ServiceRequest): string[] {
  if (request.service === "deregistration") {
    const { rearPlate, frontPlate, certificate } = request.codes
    return [rearPlate, frontPlate, certificate].flatMap((code) => (code ? [code.reveal()] : []))
  }
  const { owner, bankAccount, registrationCertificate, evbNumber } = request
  const { iban, bic, bankName } = bankAccount.reveal()
  return [
    evbNumber.reveal(),
    registrationCertificate.number,
    registrationCertificate.securityCode.reveal(),
    iban,
    bic,
    bankName,
    owner.firstName,
    owner.lastName,
    owner.birthDate.reveal(),
    owner.birthPlace.reveal(),
    owner.phone.reveal(),
    owner.email,
    ...Object.values(owner.address.reveal()),
  ]
}
