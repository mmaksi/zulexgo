/**
 * What the funnel sends for a Neuzulassung, with obviously fake values that still pass the same
 * validation as production input: the name is the German placeholder, the address is a made-up
 * street, the IBAN is the published example IBAN, the phone number is in the range the
 * Bundesnetzagentur reserves for fiction, and the email is on `example.test`.
 */
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

/** A date on which `FAKE_NEW_REGISTRATION`'s owner is of age. */
export const FAKE_NEW_REGISTRATION_NOW = new Date("2026-03-01T09:00:00.000Z")
