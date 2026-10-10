import { parseStoredNewRegistrationRequest, type StoredNewRegistrationRequest } from "@/src/core/domain/application/new-registration-request"

// An ended order holds no bank account, so its details hold none (launch plan Q54).
export function detailsOf({ engineType, evbNumber, registrationCertificate, owner, bankAccount, plate }: StoredNewRegistrationRequest): string {
  const account = bankAccount?.reveal()
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
    bankAccount: account && { iban: account.iban, bic: account.bic, bankName: account.bankName },
    plate,
  } satisfies Record<Exclude<keyof StoredNewRegistrationRequest, "service" | "vin">, unknown>
  return JSON.stringify(details)
}

export function requestFrom(vin: string, details: string, checkedAt: Date): StoredNewRegistrationRequest {
  return parseStoredNewRegistrationRequest({ vin, ...JSON.parse(details) }, checkedAt)
}
