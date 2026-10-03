import { anApplication } from "@/tests/fixtures/applications"
import { Money } from "@/src/core/domain/payment/money"
import type { EmailTemplate, Mailer } from "./mailer"

const { reference, email } = anApplication()
const statusLink = "https://zulexgo.example.test/status/faketoken-contract"

/**
 * One of each EmailTemplate, with fixed fake values. Also the input of the
 * render tests that review the HTML, so a new template must be added here.
 */
export const EVERY_TEMPLATE: EmailTemplate[] = [
  { name: "orderConfirmation", service: "deregistration", reference, statusLink },
  { name: "submittedToKba", service: "deregistration", reference, statusLink, manualProcessing: false },
  { name: "completed", service: "deregistration", reference, statusLink },
  { name: "correctionRequired", reference, statusLink, reason: "Die Zulassungsstelle konnte den Antrag nicht bearbeiten." },
  { name: "rejected", service: "deregistration", reference, statusLink, reason: "Das Fahrzeug ist bereits abgemeldet.", refund: Money.ofCents(5000), retained: Money.ofCents(1999) },
  { name: "refundIssued", reference, amount: Money.ofCents(5000) },
  { name: "statusLinkResent", reference, statusLink },
]

/**
 * Every Mailer adapter must pass this, including the fake.
 *
 * Pins down one guarantee of the port: every template can be sent and `send`
 * resolves. The idempotency-key guarantee is not checked here; the adapters'
 * own tests do it (the fake and Resend).
 */
export function mailerContract(name: string, makeSubject: () => Mailer) {
  describe(`Mailer contract: ${name}`, () => {
    it.each(EVERY_TEMPLATE.map((template) => [template.name, template] as const))("sends %s", async (_, template) => {
      await expect(makeSubject().send({ to: email, template, idempotencyKey: `contract/${template.name}` })).resolves.toBeUndefined()
    })
  })
}
