import { anApplication } from "@/tests/fixtures/applications"
import { Money } from "@/src/core/domain/payment/money"
import type { EmailTemplate, Mailer } from "./mailer"

const { reference, email } = anApplication()
const statusLink = "https://zulexgo.example.test/status/faketoken-contract"
const verificationLink = "https://verification.example.test/fake-verification-contract"
const deadline = new Date("2026-03-05T09:00:00.000Z")

/**
 * One of each EmailTemplate, with fixed fake values. Also the input of the
 * render tests that review the HTML, so a new template must be added here.
 */
export const EVERY_TEMPLATE: EmailTemplate[] = [
  { name: "orderConfirmation", service: "deregistration", reference, statusLink },
  { name: "identityVerificationRequested", reference, verificationLink, deadline },
  { name: "identityVerificationReminder", reference, verificationLink, deadline },
  { name: "identityVerified", reference, statusLink },
  { name: "submittedToKba", service: "deregistration", reference, statusLink, manualProcessing: false },
  { name: "completed", service: "deregistration", reference, statusLink },
  { name: "correctionRequired", service: "deregistration", reference, statusLink, reason: "Die Zulassungsstelle konnte den Antrag nicht bearbeiten." },
  { name: "rejected", service: "deregistration", reference, statusLink, reason: "Das Fahrzeug ist bereits abgemeldet.", refund: Money.ofCents(5000), retained: Money.ofCents(1999) },
  { name: "refundIssued", reference, amount: Money.ofCents(5000) },
  { name: "statusLinkResent", reference, statusLink },
]

/**
 * The emails whose wording is a Neuzulassung's: what was ordered, what the KBA did, what the customer may correct.
 * Each carries the same fields as its de-registration twin, so only the words differ.
 */
export const NEW_REGISTRATION_TEMPLATES: EmailTemplate[] = [
  { name: "orderConfirmation", service: "newRegistration", reference, statusLink },
  { name: "submittedToKba", service: "newRegistration", reference, statusLink, manualProcessing: false },
  { name: "completed", service: "newRegistration", reference, statusLink },
  { name: "correctionRequired", service: "newRegistration", reference, statusLink, reason: "Die Zulassungsstelle konnte den Antrag mit diesen Angaben nicht bearbeiten." },
  {
    name: "correctionRequired",
    service: "newRegistration",
    reference,
    statusLink,
    reason: "Die Angaben zu Name und Geburtsdatum stimmen nicht mit Ihrem Ausweis überein.",
    identityMismatch: true,
  },
  { name: "rejected", service: "newRegistration", reference, statusLink, reason: "Ihre Identität konnte nicht bestätigt werden.", refund: Money.ofCents(10901), retained: Money.ofCents(1999) },
]

/** What a test names an email by: its name, and the service it speaks for when the wording depends on one. */
export const labelOf = (template: EmailTemplate) =>
  `${template.name}${"service" in template ? ` (${template.service}${"identityMismatch" in template && template.identityMismatch ? ", identity mismatch" : ""})` : ""}`

/**
 * Every Mailer adapter must pass this, including the fake.
 *
 * Pins down one guarantee of the port: every template can be sent and `send`
 * resolves. The idempotency-key guarantee is not checked here; the adapters'
 * own tests do it (the fake and Resend).
 */
export function mailerContract(name: string, makeSubject: () => Mailer) {
  describe(`Mailer contract: ${name}`, () => {
    it.each([...EVERY_TEMPLATE, ...NEW_REGISTRATION_TEMPLATES].map((template, index) => [labelOf(template), template, index] as const))(
      "sends %s",
      async (_, template, index) => {
        await expect(makeSubject().send({ to: email, template, idempotencyKey: `contract/${index}/${template.name}` })).resolves.toBeUndefined()
      },
    )
  })
}
