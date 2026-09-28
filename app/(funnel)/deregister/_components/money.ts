import type { Money } from "@/src/core/domain/money"

export const euros = (money: Money) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(money.cents / 100)
