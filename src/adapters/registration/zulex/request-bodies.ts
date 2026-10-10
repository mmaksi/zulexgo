import type { StoredDeregistrationRequest } from "@/src/core/domain/application/deregistration-request"
import type { NewRegistrationRequest, StoredNewRegistrationRequest } from "@/src/core/domain/application/new-registration-request"
import type { OrderableService, ServiceRequest } from "@/src/core/domain/application/service"
import type { Correction, Corrections, NewRegistrationPatch } from "@/src/core/ports/registration/registration-gateway"

const ENGINE_TYPES = { electric: "ELECTRICAL", hybrid: "HYBRID", combustion: "COMBUSTION" } as const satisfies Record<NewRegistrationRequest["engineType"], string>
const GENDERS = { female: "FEMALE", male: "MALE", diverse: "DIVERSE", unspecified: "UNSPECIFIED" } as const satisfies Record<NewRegistrationRequest["owner"]["gender"], string>

// reserveLicencePlate: false is a founder decision: reserving the plate is out of MVP scope.
function deregistrationBody({ licencePlate, vin, codes }: StoredDeregistrationRequest) {
  if (!codes) throw new Error("A de-registration without its security codes cannot be filed")
  return {
    licencePlate,
    vin,
    rearLicencePlateSecurityCode: codes.rearPlate.reveal(),
    ...(codes.frontPlate ? { frontLicencePlateSecurityCode: codes.frontPlate.reveal() } : {}),
    securityCodeRegistrationCertificationPart1: codes.certificate.reveal(),
    reserveLicencePlate: false,
  }
}

function newRegistrationBody({ vin, engineType, evbNumber, registrationCertificate, owner, bankAccount, plate }: StoredNewRegistrationRequest) {
  if (!bankAccount) throw new Error("A Neuzulassung without its bank account cannot be filed: its order has ended")
  const { street, houseNumber, postcode, city } = owner.address.reveal()
  const address = { street, houseNumber, zipCode: postcode, city }
  const { iban, bic, bankName, country } = bankAccount.reveal()

  return {
    evbNumber: evbNumber.reveal(),
    ownerInfo: {
      source: "REQUEST_FOR_INDIVIDUAL_PERSON",
      personalInfo: {
        firstName: owner.firstName,
        lastName: owner.lastName,
        gender: GENDERS[owner.gender],
        birthDate: owner.birthDate.reveal(),
        birthPlace: owner.birthPlace.reveal(),
        phoneNumber: owner.phone.reveal(),
        email: owner.email,
        address,
      },
      deliveryInfo: { deliveryType: "SHIPPING", deliveryAddress: { firstName: owner.firstName, lastName: owner.lastName, address } },
      sepaInfo: { type: "SEPA", iban, bic, bankName, country },
    },
    admissionInfo: {
      admissionType: "STANDARD",
      licencePlateInfo: {
        licencePlateAttributes: {
          electricLicencePlate: plate.electric,
          historicLicencePlate: false,
          seasonalLicencePlate: plate.seasonal !== undefined,
          ...(plate.seasonal ? { seasonalLicencePlateFrom: plate.seasonal.from, seasonalLicencePlateUntil: plate.seasonal.until } : {}),
        },
      },
    },
    registrationCertificateInfo: {
      registrationCertificatePart2Number: registrationCertificate.number,
      registrationCertificatePart2SecurityCode: registrationCertificate.securityCode.reveal(),
    },
    vehicleInfo: { engineType: ENGINE_TYPES[engineType], vehicleType: "CAR", vehicleUsage: "NORMAL", vin },
  }
}

export function createBody(request: ServiceRequest): object {
  switch (request.service) {
    case "deregistration":
      return deregistrationBody(request)
    case "newRegistration":
      return newRegistrationBody(request)
  }
}

function deregistrationPatch({ licencePlate, vin, codes }: Correction) {
  return {
    ...(licencePlate ? { licencePlate } : {}),
    ...(vin ? { vin } : {}),
    ...(codes?.rearPlate ? { rearLicencePlateSecurityCode: codes.rearPlate.reveal() } : {}),
    ...(codes?.frontPlate ? { frontLicencePlateSecurityCode: codes.frontPlate.reveal() } : {}),
    ...(codes?.certificate ? { securityCodeRegistrationCertificationPart1: codes.certificate.reveal() } : {}),
  }
}

function newRegistrationPatch({ evbNumber, part2Number, part2SecurityCode }: NewRegistrationPatch) {
  return {
    ...(evbNumber ? { evbNumber: evbNumber.reveal() } : {}),
    ...(part2Number ? { registrationCertificatePart2Number: part2Number } : {}),
    ...(part2SecurityCode ? { registrationCertificatePart2SecurityCode: part2SecurityCode.reveal() } : {}),
  }
}

export const PATCH_BODIES: { [Service in OrderableService]: (correction: Corrections[Service]) => object } = {
  deregistration: deregistrationPatch,
  newRegistration: newRegistrationPatch,
}
