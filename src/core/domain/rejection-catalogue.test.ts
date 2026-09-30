import { reasonFor, type RejectionCatalogue } from "./rejection-catalogue"

const CATALOGUE: RejectionCatalogue = { 101: { class: "correctable", reason: "Die Fahrzeug-Identifizierungsnummer stimmt nicht." } }
const kbaError = (code: number) => ({ kind: "kbaError", code }) as const

describe("reasonFor", () => {
  it("gives the catalogue's wording for a code it lists", () => {
    expect(reasonFor(kbaError(101), CATALOGUE)).toBe("Die Fahrzeug-Identifizierungsnummer stimmt nicht.")
  })

  it("gives one general wording for every code it does not list, never the code itself", () => {
    const unknown = reasonFor(kbaError(987), CATALOGUE)

    expect(unknown).toBe(reasonFor(kbaError(654), CATALOGUE))
    expect(unknown).not.toMatch(/987|654/)
  })

  it("gives the same general wording for data refused at submission and a rejection document", () => {
    expect(reasonFor({ kind: "rejected" }, CATALOGUE)).toBe(reasonFor(kbaError(987), CATALOGUE))
    expect(reasonFor({ kind: "rejectionDocument" }, CATALOGUE)).toBe(reasonFor(kbaError(987), CATALOGUE))
  })

  it("owns up when the fault was ours: a submission that never got through", () => {
    expect(reasonFor({ kind: "unavailable" }, CATALOGUE)).toMatch(/technisch/i)
  })
})
