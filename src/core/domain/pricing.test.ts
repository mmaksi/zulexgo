import { DEREGISTRATION_TOTAL, PROCESSING_FEE } from "./pricing"

describe("de-registration price", () => {
  it("is 49 €, all-inclusive", () => {
    expect(DEREGISTRATION_TOTAL.cents).toBe(4900)
  })

  it("contains the processing fee instead of adding it on top, so a cancellation refunds 29,01 €", () => {
    expect(DEREGISTRATION_TOTAL.subtract(PROCESSING_FEE).cents).toBe(2901)
  })
})
