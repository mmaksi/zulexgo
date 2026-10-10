import { SERVICES } from "@/src/core/domain/application/service"
import { PROCESSING_FEE, SERVICE_PRICES } from "./pricing"

describe("de-registration price", () => {
  it("is 49 €, all-inclusive", () => {
    expect(SERVICE_PRICES.deregistration.cents).toBe(4900)
  })

  it("contains the 19,99 € processing fee, leaving 29,01 € to refund on a cancellation", () => {
    expect(SERVICE_PRICES.deregistration.subtract(PROCESSING_FEE).cents).toBe(2901)
  })
})

describe("service prices", () => {
  it.each([
    ["newRegistration", 12900],
    ["reRegistration", 9900],
    ["changeOfKeeper", 9900],
    ["deregistration", 4900],
    ["addressChange", 9900],
  ] as const)("%s costs %i cents", (service, cents) => {
    expect(SERVICE_PRICES[service].cents).toBe(cents)
  })

  it.each(SERVICES)("%s costs more than the processing fee it must be able to refund around", (service) => {
    expect(SERVICE_PRICES[service].isGreaterThan(PROCESSING_FEE)).toBe(true)
  })
})

