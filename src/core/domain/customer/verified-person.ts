import type { Owner } from "./owner"
import type { Secret } from "@/src/core/domain/secret"

/**
 * Who the identity provider verified, as read off the document: what an order's owner is compared with.
 * The birth date is a secret like the owner's, so it prints as a placeholder wherever it ends up.
 */
export interface VerifiedPerson {
  readonly firstName: string
  readonly lastName: string
  /** `YYYY-MM-DD`. */
  readonly birthDate: Secret<string>
}

/**
 * Case, accents, the spelling of umlauts and apostrophes, and hyphens differ between a form and a document
 * without naming another person. Marks are stripped from the decomposed letter (so the two ways to write an
 * umlaut agree), and "ae", "oe" and "ue" fold to the bare vowel, so "Müller", "Mueller" and "Muller" meet.
 * Folded this way a name can collide with a different one; that cannot matter, since the birth date has to agree too.
 */
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

/**
 * Launch plan Q47, a provisional answer pending the founder: the verified person is the order's owner
 * when first name, last name and birth date agree. The names are compared in whole, so a second first name
 * on the document that the order lacks is a mismatch; the birth date exactly. A mismatch is not a
 * failed verification: nothing was filed, so the customer can correct the order.
 */
export function isTheOwner(person: VerifiedPerson, owner: Pick<Owner, "firstName" | "lastName" | "birthDate">): boolean {
  return (
    normalised(person.firstName) === normalised(owner.firstName) &&
    normalised(person.lastName) === normalised(owner.lastName) &&
    person.birthDate.reveal() === owner.birthDate.reveal()
  )
}
