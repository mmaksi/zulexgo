import { formatEuros, Money } from "./money"

describe("Money", () => {
  it("holds whole cents only, so no float rounding reaches a refund", () => {
    expect(() => Money.ofCents(19.5)).toThrow(RangeError)
  })

  it("is never negative", () => {
    expect(() => Money.ofCents(-1)).toThrow(RangeError)
  })

  it("adds and subtracts in cents", () => {
    const total = Money.ofCents(4999).add(Money.ofCents(1999))

    expect(total.cents).toBe(6998)
    expect(total.subtract(Money.ofCents(1999)).cents).toBe(4999)
  })

  it("refuses a subtraction that would go below zero", () => {
    expect(() => Money.ofCents(1000).subtract(Money.ofCents(1999))).toThrow(RangeError)
  })

  it("compares by amount", () => {
    expect(Money.ofCents(1999).equals(Money.ofCents(1999))).toBe(true)
    expect(Money.ofCents(2000).isGreaterThan(Money.ofCents(1999))).toBe(true)
    expect(Money.ofCents(1999).isGreaterThan(Money.ofCents(1999))).toBe(false)
  })

  it("writes euros the German way, with the symbol after a space", () => {
    expect(formatEuros(Money.ofCents(1999))).toMatch(/^19,99\s€$/)
    expect(formatEuros(Money.ofCents(100_000))).toMatch(/^1\.000,00\s€$/)
    expect(formatEuros(Money.ofCents(0))).toMatch(/^0,00\s€$/)
  })
})
