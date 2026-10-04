import { z } from "zod"
import { emailSchema } from "@/src/core/domain/customer/email"
import { postalAddressSchema } from "@/src/core/domain/customer/postal-address"
import { secret } from "@/src/core/domain/secret"
import { validate } from "@/src/core/domain/validate"

const ADULT_AGE = 18

/** What the API's `Gender` offers. */
export const GENDERS = ["female", "male", "diverse", "unspecified"] as const

const name = z.string().trim().min(1)

/** Launch plan Q56, provisional: the API asks only for something; this refuses text that cannot be a number. */
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()/.-]+$/)
  .refine((phone) => {
    const digits = phone.replace(/\D/g, "").length
    return digits >= 6 && digits <= 15
  })

/** Today's date in Germany, as `YYYY-MM-DD`: a birthday begins at midnight there, not at midnight UTC. */
function todayInGermany(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now)
  const part = (type: string) => parts.find((candidate) => candidate.type === type)!.value
  return `${part("year")}-${part("month")}-${part("day")}`
}

/** A real calendar day written `YYYY-MM-DD`. */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * Whether someone born on `birthDate` is 18 or over on `today`, both `YYYY-MM-DD`: the birth date
 * is on or before the same day 18 years ago. Someone born on 29 February is therefore an adult from
 * 1 March in a year without one, never a day early.
 */
function isAdult(birthDate: string, today: string): boolean {
  const cutoff = `${String(Number(today.slice(0, 4)) - ADULT_AGE).padStart(4, "0")}${today.slice(4)}`
  return birthDate <= cutoff
}

/**
 * The keeper the car is registered to: a private person of age (launch plan Q49, provisional).
 * The birth date is checked against `now`, so the schema is made per request; the funnel passes
 * the browser's clock, the server its own. The birth date, birth place, phone number and address
 * are secrets: they identify the person and must not reach a log, an email or a status page.
 */
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

/** Throws a `ValidationError` naming the wrong fields, dotted for the address (`address.postcode`), never their values. */
export const parseOwner = (input: unknown, now: Date): Owner => validate(ownerSchema(now), input, "owner")
