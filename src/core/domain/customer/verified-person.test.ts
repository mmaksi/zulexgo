import { Secret } from "@/src/core/domain/secret"
import { isTheOwner, type VerifiedPerson } from "./verified-person"

type Details = { firstName?: string; lastName?: string; birthDate?: string }

const owner = (overrides: Details = {}) => ({
  firstName: "Erika",
  lastName: "Mustermann",
  ...overrides,
  birthDate: new Secret(overrides.birthDate ?? "1990-05-17", "birth date"),
})

const verified = (overrides: Details = {}): VerifiedPerson => ({
  firstName: "Erika",
  lastName: "Mustermann",
  ...overrides,
  birthDate: new Secret(overrides.birthDate ?? "1990-05-17", "birth date"),
})

describe("isTheOwner: whether the person the provider verified is the owner the order names (launch plan Q47, provisional)", () => {
  it("accepts the same name and birth date", () => {
    expect(isTheOwner(verified(), owner())).toBe(true)
  })

  it.each<[string, Details, Details?]>([
    ["case and spacing", { firstName: "  ERIKA ", lastName: "mustermann" }],
    ["a name typed with an umlaut and read off the document without it", { lastName: "Mueller" }, { lastName: "Müller" }],
    ["a name typed without an umlaut and read off the document with it", { lastName: "Müller" }, { lastName: "Mueller" }],
    ["ß and ss", { lastName: "Strauss" }, { lastName: "Strauß" }],
    ["other accents", { firstName: "Jose" }, { firstName: "José" }],
    ["a hyphen and a space", { firstName: "Anna Lena" }, { firstName: "Anna-Lena" }],
    // Pasted from a PDF or typed on some keyboards, an umlaut is a letter plus a combining mark, not one character.
    ["an umlaut written as a letter and a combining mark", { lastName: "Mueller" }, { lastName: "Mu\u0308ller" }],
    ["the same umlaut written both ways", { lastName: "Mu\u0308ller" }, { lastName: "M\u00fcller" }],
    ["an upper-case document and an umlaut typed", { lastName: "MULLER" }, { lastName: "Müller" }],
    ["an umlaut left off, as many keyboards and forms do", { lastName: "Müller" }, { lastName: "Muller" }],
    ["a curly and a straight apostrophe", { lastName: "O’Brien" }, { lastName: "O'Brien" }],
    ["a Scandinavian letter and its spelling", { firstName: "Søren" }, { firstName: "Soeren" }],
  ])("accepts a difference that is only %s", (_, fromDocument, typed = {}) => {
    expect(isTheOwner(verified(fromDocument), owner(typed))).toBe(true)
  })

  it.each([
    ["a typo in the first name", { firstName: "Erik" }],
    ["a typo in the last name", { lastName: "Mustermann-Weber" }],
    ["a second first name the order lacks", { firstName: "Erika Maria" }],
    ["first and last name swapped", { firstName: "Mustermann", lastName: "Erika" }],
    ["another birth date", { birthDate: "1990-05-18" }],
    ["another name altogether, however alike the letters", { lastName: "Muster" }],
  ])("refuses %s", (_, fromDocument) => {
    expect(isTheOwner(verified(fromDocument), owner())).toBe(false)
  })

  it("compares the birth date exactly, since a person born a day apart is another person", () => {
    expect(isTheOwner(verified({ birthDate: "1990-05-17" }), owner({ birthDate: "1990-05-17" }))).toBe(true)
    expect(isTheOwner(verified({ birthDate: "1990-17-05" }), owner({ birthDate: "1990-05-17" }))).toBe(false)
  })
})
