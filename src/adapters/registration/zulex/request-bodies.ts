import type { DeregistrationRequest } from "@/src/core/domain/application/deregistration-request"
import type { NewRegistrationRequest } from "@/src/core/domain/application/new-registration-request"
import type { OrderableService, ServiceRequest } from "@/src/core/domain/application/service"
import type { Correction, Corrections, NewRegistrationPatch } from "@/src/core/ports/registration/registration-gateway"

/** What the API's enums call what the customer chose. A new value fails to compile until it is named here. */
const ENGINE_TYPES = { electric: "ELECTRICAL", hybrid: "HYBRID", combustion: "COMBUSTION" } as const satisfies Record<NewRegistrationRequest["engineType"], string>
const GENDERS = { female: "FEMALE", male: "MALE", diverse: "DIVERSE", unspecified: "UNSPECIFIED" } as const satisfies Record<NewRegistrationRequest["owner"]["gender"], string>

/**
 * The create body of a de-registration. The front plate code is sent only for a two-plate vehicle.
 * Reserving the plate is out of scope for the MVP (founder decision).
 */
function deregistrationBody({ licencePlate, vin, codes }: DeregistrationRequest) {
  return {
    licencePlate,
    vin,
    rearLicencePlateSecurityCode: codes.rearPlate.reveal(),
    ...(codes.frontPlate ? { frontLicencePlateSecurityCode: codes.frontPlate.reveal() } : {}),
    securityCodeRegistrationCertificationPart1: codes.certificate.reveal(),
    reserveLicencePlate: false,
  }
}

/**
 * The create body of a Neuzulassung for a private person, in the shape of the spec's
 * `CreateRegistrationApplicationRequest`. What is the same for every order at launch is fixed here
 * (a car, normal use, a standard registration, shipping to the owner's name and address, the vehicle
 * tax by direct debit from the owner's account, no H-plate, no wish plate). The plate is the one the
 * authority assigns. Every secret is revealed here and nowhere else, only to be sent.
 */
function newRegistrationBody({ vin, engineType, evbNumber, registrationCertificate, owner, bankAccount, plate }: NewRegistrationRequest) {
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

/** The create body for the service the request names. */
export function createBody(request: ServiceRequest): object {
  switch (request.service) {
    case "deregistration":
      return deregistrationBody(request)
    case "newRegistration":
      return newRegistrationBody(request)
  }
}

/** Only the fields the customer changed, so everything else stays as Zulex holds it. */
function deregistrationPatch({ licencePlate, vin, codes }: Correction) {
  return {
    ...(licencePlate ? { licencePlate } : {}),
    ...(vin ? { vin } : {}),
    ...(codes?.rearPlate ? { rearLicencePlateSecurityCode: codes.rearPlate.reveal() } : {}),
    ...(codes?.frontPlate ? { frontLicencePlateSecurityCode: codes.frontPlate.reveal() } : {}),
    ...(codes?.certificate ? { securityCodeRegistrationCertificationPart1: codes.certificate.reveal() } : {}),
  }
}

/** The three fields the spec's `PatchRegistrationApplicationRequest` takes of a filed Neuzulassung, when changed. */
function newRegistrationPatch({ evbNumber, part2Number, part2SecurityCode }: NewRegistrationPatch) {
  return {
    ...(evbNumber ? { evbNumber: evbNumber.reveal() } : {}),
    ...(part2Number ? { registrationCertificatePart2Number: part2Number } : {}),
    ...(part2SecurityCode ? { registrationCertificatePart2SecurityCode: part2SecurityCode.reveal() } : {}),
  }
}

/** The patch body for each service. */
export const PATCH_BODIES: { [Service in OrderableService]: (correction: Corrections[Service]) => object } = {
  deregistration: deregistrationPatch,
  newRegistration: newRegistrationPatch,
}
