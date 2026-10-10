import type { Owner } from "./owner"
import type { Secret } from "@/src/core/domain/secret"

export interface VerifiedPerson {
  readonly firstName: string
  readonly lastName: string
  /** `YYYY-MM-DD`, as the owner's: the two are compared exactly. */
  readonly birthDate: Secret<string>
}

// Loose on purpose (Müller = Mueller = Muller): safe only because the birth date must agree too.
const normalised = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replaceAll("ß", "ss")
    .replaceAll("ø", "o")
    .replaceAll("æ", "ae")
    .replace(/[aou]e/g, (pair) => pair[0])
    .replace(/['’`´.]/g, "")
    .replace(/[\s-]+/g, " ")
    .trim()

// Provisional: launch plan Q47
export function isTheOwner(person: VerifiedPerson, owner: Pick<Owner, "firstName" | "lastName" | "birthDate">): boolean {
  return (
    normalised(person.firstName) === normalised(owner.firstName) &&
    normalised(person.lastName) === normalised(owner.lastName) &&
    person.birthDate.reveal() === owner.birthDate.reveal()
  )
}
