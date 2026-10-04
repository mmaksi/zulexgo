import type { NewRegistrationRequest } from "@/src/core/domain/application/new-registration-request"
import { parseNewRegistrationRequest } from "@/src/core/domain/application/new-registration-request"

/**
 * Everything of a Neuzulassung request that is not the VIN (a plain column), as the plain JSON the
 * request parses back from. The one place besides the cipher where a Neuzulassung's secrets are
 * revealed: the result is encrypted at once, bound to the order's reference, and never stored or logged as is.
 */
export function detailsOf({ engineType, evbNumber, registrationCertificate, owner, bankAccount, plate }: NewRegistrationRequest): string {
  const { iban, bic, bankName } = bankAccount.reveal()
  // Every field of the request but the VIN (a plain column) and the service (a column of its own): one left out would be lost on write.
  const details = {
    engineType,
    evbNumber: evbNumber.reveal(),
    registrationCertificate: { number: registrationCertificate.number, securityCode: registrationCertificate.securityCode.reveal() },
    owner: {
      firstName: owner.firstName,
      lastName: owner.lastName,
      gender: owner.gender,
      birthDate: owner.birthDate.reveal(),
      birthPlace: owner.birthPlace.reveal(),
      phone: owner.phone.reveal(),
      email: owner.email,
      address: owner.address.reveal(),
    },
    bankAccount: { iban, bic, bankName },
    plate,
  } satisfies Record<Exclude<keyof NewRegistrationRequest, "service" | "vin">, unknown>
  return JSON.stringify(details)
}

/**
 * Parsed again as any request is, so a row that no longer validates fails loudly. The keeper's age is
 * checked against `checkedAt`, a day on or after the one the details were entered: an order stored when
 * its keeper was of age stays readable, whatever today's date is.
 */
export function requestFrom(vin: string, details: string, checkedAt: Date): NewRegistrationRequest {
  return parseNewRegistrationRequest({ vin, ...JSON.parse(details) }, checkedAt)
}
