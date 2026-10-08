import { ConsentRequired } from "@/src/core/errors/application/consent-required"
import { LEGAL_TEXT_VERSIONS, recordConsent } from "./consent"

const NOW = new Date("2026-03-01T09:00:00.000Z")
const ALL = { terms: true, earlyStart: true, powerOfAttorney: true }

describe("recordConsent", () => {
  it("records the version of the AGB and when the customer agreed, for a de-registration", () => {
    expect(recordConsent("deregistration", { terms: true, earlyStart: true }, NOW)).toEqual({
      agbVersion: LEGAL_TEXT_VERSIONS.agb,
      givenAt: NOW,
    })
  })

  it("also records the power of attorney for a Neuzulassung, which is filed in the customer's name", () => {
    expect(recordConsent("newRegistration", ALL, NOW)).toEqual({
      agbVersion: LEGAL_TEXT_VERSIONS.agb,
      powerOfAttorneyVersion: LEGAL_TEXT_VERSIONS.powerOfAttorney,
      givenAt: NOW,
    })
  })

  it("does not record a power of attorney for a service that needs none, even if the browser sends one", () => {
    expect(recordConsent("deregistration", ALL, NOW)).not.toHaveProperty("powerOfAttorneyVersion")
  })

  it.each([
    ["terms", { earlyStart: true, powerOfAttorney: true }],
    ["terms", { ...ALL, terms: false }],
    ["earlyStart", { ...ALL, earlyStart: false }],
    ["powerOfAttorney", { terms: true, earlyStart: true }],
    ["powerOfAttorney", { ...ALL, powerOfAttorney: false }],
  ])("refuses a Neuzulassung without %s", (_, given) => {
    expect(() => recordConsent("newRegistration", given, NOW)).toThrow(ConsentRequired)
  })

  it.each([
    ["terms", { earlyStart: true }],
    ["terms", { terms: false, earlyStart: true }],
    ["earlyStart", { terms: true, earlyStart: false }],
    ["earlyStart", { terms: true }],
  ])("refuses a de-registration without %s", (_, given) => {
    expect(() => recordConsent("deregistration", given, NOW)).toThrow(ConsentRequired)
  })

  it.each([undefined, null, "terms", 1, [true, true], { terms: "true", earlyStart: 1 }])(
    "takes only the boolean true as a consent, nothing the browser might send instead: %j",
    (given) => {
      expect(() => recordConsent("deregistration", given, NOW)).toThrow(ConsentRequired)
    },
  )
})
