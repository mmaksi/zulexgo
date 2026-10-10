import type { ServiceRequest } from "@/src/core/domain/application/service"

export function secretsOf(request: ServiceRequest): string[] {
  if (request.service === "deregistration") {
    const { rearPlate, frontPlate, certificate } = request.codes ?? {}
    return [rearPlate, frontPlate, certificate].flatMap((code) => (code ? [code.reveal()] : []))
  }
  const { owner, bankAccount, registrationCertificate, evbNumber } = request
  const { iban, bic, bankName } = bankAccount?.reveal() ?? {}
  return [
    evbNumber.reveal(),
    registrationCertificate.number,
    registrationCertificate.securityCode.reveal(),
    ...(iban && bic && bankName ? [iban, bic, bankName] : []),
    owner.firstName,
    owner.lastName,
    owner.birthDate.reveal(),
    owner.birthPlace.reveal(),
    owner.phone.reveal(),
    owner.email,
    ...Object.values(owner.address.reveal()),
  ]
}
