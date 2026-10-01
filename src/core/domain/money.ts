/** Euro amounts in whole cents. Refund maths on floats would lose cents. */
export class Money {
  private constructor(readonly cents: number) {}

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

  isGreaterThan(other: Money): boolean {
    return this.cents > other.cents
  }

  equals(other: Money): boolean {
    return this.cents === other.cents
  }
}

const EURO_FORMAT = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" })

/** The one way an amount is written for a customer: on the page, in an email, at checkout. */
export const formatEuros = (money: Money) => EURO_FORMAT.format(money.cents / 100)
