import { anApplication } from "@/tests/fixtures/applications"
import { Money } from "@/src/core/domain/money"
import type { EmailTemplate, Mailer } from "./mailer"

const { reference, email } = anApplication()
const statusLink = "https://zulexgo.example.test/status/faketoken-contract"

export const EVERY_TEMPLATE: EmailTemplate[] = [
  { name: "orderConfirmation", reference, statusLink },
  { name: "submittedToKba", reference, statusLink, manualProcessing: false },
  { name: "completed", reference, statusLink },
  { name: "correctionRequired", reference, statusLink },
  { name: "rejected", reference, statusLink, refund: Money.ofCents(5000) },
  { name: "refundIssued", reference, amount: Money.ofCents(5000) },
]

/** Every Mailer adapter must pass this, including the fake. */
export function mailerContract(name: string, makeSubject: () => Mailer) {
  describe(`Mailer contract: ${name}`, () => {
    it.each(EVERY_TEMPLATE.map((template) => [template.name, template] as const))("sends %s", async (_, template) => {
      await expect(makeSubject().send({ to: email, template })).resolves.toBeUndefined()
    })
  })
}
