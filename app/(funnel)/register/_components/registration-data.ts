import { newRegistrationRequestSchema } from "@/src/core/domain/application/new-registration-request"

export interface RegistrationData {
  vin: string
  engineType: string
  evbNumber: string
  part2Number: string
  part2SecurityCode: string
  firstName: string
  lastName: string
  gender: string
  birthDate: string
  birthPlace: string
  street: string
  houseNumber: string
  postcode: string
  city: string
  phone: string
  email: string
  electric: boolean
  seasonal: boolean
  seasonFrom: string
  seasonUntil: string
  iban: string
  bic: string
  bankName: string
}

export type RegistrationField = keyof RegistrationData

export const ENGINE_CHOICES = [
  { value: "electric", label: "Elektro" },
  { value: "hybrid", label: "Hybrid" },
  { value: "combustion", label: "Benzin oder Diesel" },
] as const

export const MONTH_NAMES = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"] as const

export const EMPTY_REGISTRATION: RegistrationData = {
  vin: "",
  engineType: "",
  evbNumber: "",
  part2Number: "",
  part2SecurityCode: "",
  firstName: "",
  lastName: "",
  gender: "",
  birthDate: "",
  birthPlace: "",
  street: "",
  houseNumber: "",
  postcode: "",
  city: "",
  phone: "",
  email: "",
  electric: false,
  seasonal: false,
  seasonFrom: "",
  seasonUntil: "",
  iban: "",
  bic: "",
  bankName: "",
}

export type TextualField = Exclude<RegistrationField, "electric" | "seasonal">

const PATHS: Record<TextualField, string> = {
  vin: "vin",
  engineType: "engineType",
  evbNumber: "evbNumber",
  part2Number: "registrationCertificate.number",
  part2SecurityCode: "registrationCertificate.securityCode",
  firstName: "owner.firstName",
  lastName: "owner.lastName",
  gender: "owner.gender",
  birthDate: "owner.birthDate",
  birthPlace: "owner.birthPlace",
  street: "owner.address.street",
  houseNumber: "owner.address.houseNumber",
  postcode: "owner.address.postcode",
  city: "owner.address.city",
  phone: "owner.phone",
  email: "owner.email",
  seasonFrom: "plate.seasonal.from",
  seasonUntil: "plate.seasonal.until",
  iban: "bankAccount.iban",
  bic: "bankAccount.bic",
  bankName: "bankAccount.bankName",
}

export const MESSAGES: Record<Exclude<TextualField, "iban">, string> = {
  vin: "Die FIN eines Neuwagens hat genau 17 Stellen: Buchstaben und Ziffern, Feld E im Fahrzeugschein.",
  engineType: "Wählen Sie, wie Ihr Fahrzeug angetrieben wird.",
  evbNumber: "Prüfen Sie die eVB-Nummer: 7 Zeichen aus Buchstaben und Ziffern, ohne I und O.",
  part2Number: "Geben Sie die Nummer der Zulassungsbescheinigung Teil II ein, bis zu 20 Zeichen.",
  part2SecurityCode: "Geben Sie den Sicherheitscode unter dem Rubbelfeld der Zulassungsbescheinigung Teil II ein.",
  firstName: "Geben Sie Ihren Vornamen ein.",
  lastName: "Geben Sie Ihren Nachnamen ein.",
  gender: "Wählen Sie eine Angabe.",
  birthDate: "Geben Sie Ihr Geburtsdatum ein. Für die Online-Zulassung müssen Sie mindestens 18 Jahre alt sein.",
  birthPlace: "Geben Sie Ihren Geburtsort ein.",
  street: "Geben Sie Ihre Straße ein.",
  houseNumber: "Beginnen Sie die Hausnummer mit einer Ziffer, z. B. 12 oder 12a.",
  postcode: "Geben Sie eine 5-stellige Postleitzahl ein.",
  city: "Geben Sie Ihren Wohnort ein.",
  phone: "Geben Sie eine Telefonnummer ein, z. B. 030 1234567 oder +49 30 1234567.",
  email: "Geben Sie eine gültige E-Mail-Adresse ein, z. B. name@beispiel.de.",
  seasonFrom: "Wählen Sie den ersten Monat der Saison.",
  seasonUntil: "Wählen Sie den letzten Monat der Saison.",
  bic: "Prüfen Sie die BIC: 8 oder 11 Zeichen, z. B. COBADEFFXXX.",
  bankName: "Geben Sie den Namen Ihrer Bank ein.",
}

// Provisional: launch plan Q54 (German accounts only)
const GERMAN_IBAN_SHAPE = /^DE\d{20}$/

function ibanMessage(iban: string): string {
  return GERMAN_IBAN_SHAPE.test(iban.replace(/\s+/g, "").toUpperCase())
    ? "Diese IBAN ist ungültig, vermutlich ein Tippfehler. Prüfen Sie jede Ziffer."
    : "Eine deutsche IBAN beginnt mit DE und hat 22 Stellen, z. B. DE89 3704 0044 0532 0130 00."
}

const messageFor = (field: TextualField, data: RegistrationData) => (field === "iban" ? ibanMessage(data.iban) : MESSAGES[field])

export type Step = "vehicle" | "keeper" | "plate" | "tax"

export function fieldsOf(step: Step, data: RegistrationData): TextualField[] {
  switch (step) {
    case "vehicle":
      return ["vin", "engineType", "part2Number", "part2SecurityCode", "evbNumber"]
    case "keeper":
      return ["firstName", "lastName", "gender", "birthDate", "birthPlace", "street", "houseNumber", "postcode", "city", "phone", "email"]
    case "plate":
      return data.seasonal ? ["seasonFrom", "seasonUntil"] : []
    case "tax":
      return ["iban", "bic", "bankName"]
  }
}

export function toRequest(data: RegistrationData) {
  return {
    vin: data.vin,
    engineType: data.engineType,
    evbNumber: data.evbNumber,
    registrationCertificate: { number: data.part2Number, securityCode: data.part2SecurityCode },
    owner: {
      firstName: data.firstName,
      lastName: data.lastName,
      gender: data.gender,
      birthDate: data.birthDate,
      birthPlace: data.birthPlace,
      phone: data.phone,
      email: data.email,
      address: { street: data.street, houseNumber: data.houseNumber, postcode: data.postcode, city: data.city },
    },
    bankAccount: { iban: data.iban, bic: data.bic, bankName: data.bankName },
    plate: {
      electric: data.engineType === "electric" && data.electric,
      ...(data.seasonal ? { seasonal: { from: Number(data.seasonFrom), until: Number(data.seasonUntil) } } : {}),
    },
  }
}

export function validateFields(data: RegistrationData, fields: readonly TextualField[], now: Date): Partial<Record<TextualField, string>> {
  const result = newRegistrationRequestSchema(now).safeParse(toRequest(data))
  if (result.success) return {}

  const wrong = new Set(result.error.issues.map((issue) => issue.path.join(".")))
  return Object.fromEntries(fields.filter((field) => wrong.has(PATHS[field])).map((field) => [field, messageFor(field, data)]))
}
