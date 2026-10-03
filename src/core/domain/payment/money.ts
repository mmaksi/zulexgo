/**
 * Euro amounts in whole cents. Refund maths on floats would lose cents. Never negative:
 * every result, subtraction included, goes through `ofCents`, so a subtraction that would
 * go below zero throws instead of returning a debt.
 */
export class Money {
  private constructor(readonly cents: number) {}

  /** Throws `RangeError` for a fractional, negative or non-finite number of cents. */
  static ofCents(cents: number): Money {
    if (!Number.isInteger(cents) || cents < 0) throw new RangeError(`Money must be whole, non-negative cents, got ${cents}`)
    return new Money(cents)
  }

  add(other: Money): Money {
    return Money.ofCents(this.cents + other.cents)
  }

  subtract(other: Money): Money {
    return Money.ofCents(this.cents - other.cents)
  }

  /** Strictly greater: equal amounts are not. */
  isGreaterThan(other: Money): boolean {
    return this.cents > other.cents
  }

  /** By amount, not identity: two `Money` of the same cents are equal. */
  equals(other: Money): boolean {
    return this.cents === other.cents
  }
}

const EURO_FORMAT = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" })

/**
 * The one way an amount is written for a customer: on the page, in an email, at checkout.
 * German notation: a decimal comma, a dot between thousands, the euro sign after the amount
 * (for example "1.000,00 €").
 */
export const formatEuros = (money: Money) => EURO_FORMAT.format(money.cents / 100)
