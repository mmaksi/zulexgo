import { z } from "zod"
import { emailSchema } from "@/src/core/domain/customer/email"
import { postalAddressSchema } from "@/src/core/domain/customer/postal-address"
import { secret } from "@/src/core/domain/secret"

const ADULT_AGE = 18

export const GENDERS = ["female", "male", "diverse", "unspecified"] as const

const name = z.string().trim().min(1)

// Provisional: launch plan Q56: the API takes any text; this refuses what cannot be a phone number.
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()/.-]+$/)
  .refine((phone) => {
    const digits = phone.replace(/\D/g, "").length
    return digits >= 6 && digits <= 15
  })

// A birthday begins at midnight in Germany, not at midnight UTC.
function todayInGermany(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now)
  const part = (type: string) => parts.find((candidate) => candidate.type === type)!.value
  return `${part("year")}-${part("month")}-${part("day")}`
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function isAdult(birthDate: string, today: string): boolean {
  const cutoff = `${String(Number(today.slice(0, 4)) - ADULT_AGE).padStart(4, "0")}${today.slice(4)}`
  return birthDate <= cutoff
}

// Provisional: launch plan Q49 (a private person of age)
export const ownerSchema = (now: Date) =>
  z.object({
    firstName: name,
    lastName: name,
    gender: z.enum(GENDERS),
    birthDate: secret(
      z
        .string()
        .trim()
        .refine(isCalendarDate)
        .refine((birthDate) => isAdult(birthDate, todayInGermany(now))),
      "birth date",
    ),
    birthPlace: secret(name, "birth place"),
    phone: secret(phoneSchema, "phone number"),
    email: emailSchema,
    address: secret(postalAddressSchema, "address"),
  })

export type Owner = z.output<ReturnType<typeof ownerSchema>>
