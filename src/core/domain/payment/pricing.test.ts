import { SERVICES } from "@/src/core/domain/application/service"
import { PROCESSING_FEE, quote, SERVICE_PRICES, type Basket } from "./pricing"

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

describe("quote", () => {
  const split = (basket: Basket) => {
    const { atCheckout, afterCompletion, total } = quote(basket)
    return [atCheckout.cents, afterCompletion.cents, total.cents]
  }

  it("charges a bare service in full at checkout and nothing afterwards", () => {
    expect(split({ service: "deregistration" })).toEqual([4900, 0, 4900])
    expect(split({ service: "newRegistration" })).toEqual([12900, 0, 12900])
  })

  it.each([
    ["one standard plate", { count: 1, carbon: false }, 1250 + 495],
    ["a standard pair", { count: 2, carbon: false }, 2500 + 495],
    ["one carbon plate", { count: 1, carbon: true }, 1650 + 495],
    ["a carbon pair", { count: 2, carbon: true }, 3300 + 495],
  ] as const)("prices %s with its shipping, due after the KBA", (_, plates, due) => {
    expect(split({ service: "newRegistration", plates })).toEqual([12900, due, 12900 + due])
  })

  it("adds a sticker to a carbon pair and shipping to 176,94 € in total", () => {
    const basket: Basket = { service: "newRegistration", plates: { count: 2, carbon: true }, fineDustSticker: true }
    expect(split(basket)).toEqual([12900, 4794, 17694])
  })

  it("prices a standard pair with shipping at 158,95 € in total", () => {
    expect(split({ service: "newRegistration", plates: { count: 2, carbon: false } })).toEqual([12900, 2995, 15895])
  })

  it("ships only plates: a sticker alone costs 9,99 €", () => {
    expect(split({ service: "addressChange", fineDustSticker: true })).toEqual([9900, 999, 10899])
  })

  it.each(SERVICES)("charges only the %s at checkout, whatever is ordered with it", (service) => {
    const { atCheckout } = quote({ service, plates: { count: 2, carbon: true }, fineDustSticker: true })

    expect(atCheckout.equals(SERVICE_PRICES[service])).toBe(true)
  })
})
