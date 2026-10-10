// Obviously fake but valid: the published example IBAN, a phone number in the range kept for fiction.
export const FAKE_NEW_REGISTRATION = {
  vin: "FAKEVIN0000000002",
  engineType: "combustion",
  evbNumber: "FAKEEVB",
  registrationCertificate: { number: "FAKE0001", securityCode: "FAKECODE" },
  owner: {
    firstName: "Erika",
    lastName: "Mustermann",
    gender: "female",
    birthDate: "1990-05-17",
    birthPlace: "Musterstadt",
    phone: "+49 30 23125000",
    email: "erika.mustermann@example.test",
    address: { street: "Beispielstraße", houseNumber: "12a", postcode: "10115", city: "Berlin" },
  },
  bankAccount: { iban: "DE89370400440532013000", bic: "COBADEFFXXX", bankName: "Beispielbank" },
  plate: { electric: false },
} as const

export const FAKE_NEW_REGISTRATION_NOW = new Date("2026-03-01T09:00:00.000Z")
