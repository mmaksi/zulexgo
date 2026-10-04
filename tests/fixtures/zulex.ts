/**
 * Zulex payloads, modelled on docs/api-1.yaml: no response has been captured yet, so these follow the
 * spec. When a spike has run, scrubbed real responses replace them. Values are obviously fake and
 * pass the spec's patterns.
 */
import { z } from "zod"

export const ZULEX_BASE_URL = "https://integration-zulex.de/zulex-api/v1"

export type ZulexStatus = "IN_PROGRESS" | "FINISHED" | "ERROR"

export type ZulexDocumentType =
  | "DEREGISTRATION_CONFIRMATION"
  | "REGISTRATION_CONFIRMATION"
  | "FEE"
  | "TEMPORARY_REGISTRATION_CERTIFICATE"
  | "REJECTION"
  | "UNKNOWN"

export interface ZulexDocument {
  /** int64 in the spec; kept as source text so ids beyond 2^53 survive the fixture. */
  readonly id: string
  readonly type: ZulexDocumentType
}

export interface ZulexErrorInfo {
  readonly code: number
  readonly description?: string
  readonly details?: string[]
}

export interface CreateDeregistrationBody {
  licencePlate: { prefix: string; letters: string; numbers: string }
  vin: string
  rearLicencePlateSecurityCode: string
  frontLicencePlateSecurityCode?: string
  securityCodeRegistrationCertificationPart1: string
  reserveLicencePlate?: boolean
  correlationId?: string
}

/**
 * The spec's `CreateRegistrationApplicationRequest` for a private person's standard registration, field by
 * field with the spec's own patterns (the eVB one unanchored, as there). Strict: a field the spec does
 * not name, or a misspelt one, fails. `oneOf` branches this service never sends (a legal entity, a
 * day registration) are left out, so a body built for one fails here too.
 */
const address = z.strictObject({
  city: z.string().min(1),
  houseNumber: z.string().regex(/^(\d{1,4})(?!\d)(.*)$/).optional(),
  street: z.string().min(1),
  zipCode: z.string().min(1),
})

const contactAddress = z
  .strictObject({ address, firstName: z.string().optional(), lastName: z.string().optional(), organizationName: z.string().optional() })
  .refine(({ organizationName, firstName, lastName }) => organizationName !== undefined || (firstName !== undefined && lastName !== undefined))

const wishLicencePlate = z.strictObject({
  licencePlate: z.strictObject({
    letters: z.string().regex(/^[A-Z]{1,2}$/),
    numbers: z.string().regex(/^(?!0)\d{1,4}$/),
    prefix: z.string().regex(/^[A-ZÄÖÜ]{1,3}$/),
  }),
  pin: z.string().min(3).max(8),
})

const evbNumber = z.string().regex(/[A-HJ-NP-Z0-9]{7}/)
const part2Number = z.string().min(1).max(20)
const month = z.int().min(1).max(12)

export const createRegistrationApplicationSpec = z.strictObject({
  admissionInfo: z.strictObject({
    admissionType: z.literal("STANDARD"),
    licencePlateInfo: z.strictObject({
      licencePlateAttributes: z.strictObject({
        electricLicencePlate: z.boolean(),
        historicLicencePlate: z.boolean(),
        seasonalLicencePlate: z.boolean(),
        seasonalLicencePlateFrom: month.optional(),
        seasonalLicencePlateUntil: month.optional(),
      }),
      wishLicencePlate: wishLicencePlate.optional(),
    }),
  }),
  correlationId: z.uuid().optional(),
  evbNumber,
  ownerInfo: z.strictObject({
    source: z.literal("REQUEST_FOR_INDIVIDUAL_PERSON"),
    deliveryInfo: z.strictObject({
      deliveryAddress: contactAddress,
      deliveryType: z.enum(["PICKUP", "SHIPPING"]),
      differingDeliveryAddressForRegistrationCertificatePart2: contactAddress.optional(),
    }),
    personalInfo: z.strictObject({
      academicTitle: z.string().optional(),
      address,
      birthDate: z.iso.date(),
      birthPlace: z.string().min(1),
      email: z.string(),
      familyName: z.string().optional(),
      firstName: z.string().min(1),
      gender: z.enum(["FEMALE", "MALE", "DIVERSE", "UNSPECIFIED"]),
      lastName: z.string().min(1),
      phoneNumber: z.string().min(1),
    }),
    sepaInfo: z
      .strictObject({
        type: z.literal("SEPA"),
        bankName: z.string().min(1),
        bic: z.string().min(1).max(11),
        country: z.string().min(1),
        iban: z.string().min(1),
      })
      .optional(),
  }),
  registrationCertificateInfo: z.strictObject({
    registrationCertificatePart2Number: part2Number,
    registrationCertificatePart2SecurityCode: z.string().min(1),
  }),
  vehicleInfo: z.strictObject({
    engineType: z.enum(["ELECTRICAL", "HYBRID", "COMBUSTION", "NO_ENGINE"]),
    vehicleType: z.enum(["CAR", "MOTORCYCLE", "_125", "QUAD", "TRAILER", "TRUCK", "OTHER"]),
    vehicleUsage: z.enum(["NORMAL", "TAXI", "SELF_DRIVEN_RENTAL"]).optional(),
    vin: z.string().regex(/^[A-Z0-9]{1,17}$/),
  }),
})

export type CreateRegistrationBody = z.output<typeof createRegistrationApplicationSpec>

/** The spec's `PatchRegistrationApplicationRequest`: the only four things a filed registration can change. */
export const patchRegistrationApplicationSpec = z.strictObject({
  evbNumber: evbNumber.optional(),
  registrationCertificatePart2Number: part2Number.optional(),
  registrationCertificatePart2SecurityCode: z.string().optional(),
  wishLicencePlate: wishLicencePlate.optional(),
})

/**
 * The body of a GET of an application as JSON text: what was filed, echoed back (the API returns the
 * personal data and the security codes it was given), then its state. Document ids are written as bare
 * int64 numbers, as the API sends them.
 */
export function applicationResponseJson(input: {
  applicationId: string
  echoed: object
  status: ZulexStatus | string
  documents?: readonly ZulexDocument[]
  errorInfo?: ZulexErrorInfo
}): string {
  const documents = (input.documents ?? []).map((document) => `{"id":${document.id},"type":"${document.type}"}`)
  const rest = JSON.stringify({
    applicationId: input.applicationId,
    ...input.echoed,
    status: input.status,
    ...(input.errorInfo ? { errorInfo: input.errorInfo } : {}),
  })
  return `{"documents":[${documents.join(",")}],${rest.slice(1)}`
}

/** GetDeregistrationApplicationResponse as JSON text. */
export const deregistrationResponseJson = (input: {
  applicationId: string
  body: CreateDeregistrationBody
  status: ZulexStatus | string
  documents?: readonly ZulexDocument[]
  errorInfo?: ZulexErrorInfo
}): string =>
  applicationResponseJson({
    applicationId: input.applicationId,
    echoed: { ...input.body, reserveLicencePlate: input.body.reserveLicencePlate ?? false },
    status: input.status,
    documents: input.documents,
    errorInfo: input.errorInfo,
  })
