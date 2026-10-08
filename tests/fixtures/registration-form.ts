import type { RegistrationData } from "@/app/(funnel)/register/_components/registration-data"

/** What a customer types for the fake car: obviously fake values that pass the same validation as production input. */
export const FILLED_REGISTRATION_FORM: RegistrationData = {
  vin: "fakevin0000000002",
  engineType: "combustion",
  evbNumber: "fakeevb",
  part2Number: "FAKE0001",
  part2SecurityCode: "FAKECODE",
  firstName: "Erika",
  lastName: "Mustermann",
  gender: "female",
  birthDate: "1990-05-17",
  birthPlace: "Musterstadt",
  street: "Beispielstraße",
  houseNumber: "12a",
  postcode: "10115",
  city: "Berlin",
  phone: "+49 30 23125000",
  email: "erika.mustermann@example.test",
  electric: false,
  seasonal: false,
  seasonFrom: "",
  seasonUntil: "",
  iban: "DE89 3704 0044 0532 0130 00",
  bic: "cobadeffxxx",
  bankName: "Beispielbank",
}
