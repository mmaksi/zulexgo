import { EVERY_TEMPLATE } from "@/src/core/ports/mail/mailer.contract"
import { Money } from "@/src/core/domain/payment/money"
import type { EmailTemplate } from "@/src/core/ports/mail/mailer"
import { renderEmail } from "./render"

const { reference } = EVERY_TEMPLATE[0]
const statusLink = "https://zulexgo.example.test/status/faketoken-render-test"

const SUBJECT_LIMIT = 70
const BODY_LIMIT = 600

const hrefsIn = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map(([, href]) => href.replaceAll("&amp;", "&"))

describe("renderEmail", () => {
  it.each(EVERY_TEMPLATE.map((template) => [template.name, template] as const))(
    "%s: a subject with the order id within the limit, a body within the limit, German, and no other link than the status link",
    async (_, template) => {
      const { subject, html, text } = await renderEmail(template)

      expect(subject).toContain(template.reference)
      expect(subject.length).toBeLessThanOrEqual(SUBJECT_LIMIT)
      expect(text.length).toBeLessThanOrEqual(BODY_LIMIT + 300)
      expect(html).toContain('lang="de"')
      expect(html).not.toContain('lang="en"')
      const statusLinks = "statusLink" in template ? [template.statusLink] : []
      expect(hrefsIn(html).filter((href) => href.startsWith("http"))).toEqual(statusLinks)
    },
  )

  it.each(EVERY_TEMPLATE.map((template) => [template.name, template] as const))("%s: reviewed HTML", async (_, template) => {
    expect((await renderEmail(template)).html).toMatchSnapshot()
  })

  it("keeps the body of each email under the limit, without the fixed greeting and footer", async () => {
    for (const template of EVERY_TEMPLATE) {
      const { text } = await renderEmail(template)
      const body = text.split("\n\n").slice(2, -1).join("\n\n")
      expect(body.length).toBeLessThanOrEqual(BODY_LIMIT)
    }
  })

  describe("the KBA email", () => {
    const submitted = (manualProcessing: boolean): EmailTemplate => ({ name: "submittedToKba", reference, statusLink, manualProcessing })

    it("promises minutes to hours when the authority is online", async () => {
      expect((await renderEmail(submitted(false))).text).toMatch(/wenigen Minuten bis Stunden/)
    })

    it("warns of days when the authority works by hand", async () => {
      expect((await renderEmail(submitted(true))).text).toMatch(/einige Tage/)
    })
  })

  describe("the rejection email", () => {
    const rejected = (retained: number): EmailTemplate => ({
      name: "rejected",
      reference,
      statusLink,
      reason: "Das Fahrzeug ist bereits abgemeldet.",
      refund: Money.ofCents(6999 - retained),
      retained: Money.ofCents(retained),
    })

    it("names the fee it keeps, and the amount that comes back", async () => {
      const { text } = await renderEmail(rejected(1999))

      expect(text).toMatch(/50,00\s€/)
      expect(text).toMatch(/19,99\s€/)
    })

    it("does not mention a fee when the customer gets everything back", async () => {
      const { text } = await renderEmail(rejected(0))

      expect(text).toMatch(/69,99\s€/)
      expect(text).not.toMatch(/Bearbeitungsgebühr/)
    })
  })

  it.each(["correctionRequired", "rejected"] as const)("says in the %s email why the application failed", async (name) => {
    const reason = "Die Fahrzeug-Identifizierungsnummer stimmt nicht."
    const template: EmailTemplate =
      name === "rejected"
        ? { name, reference, statusLink, reason, refund: Money.ofCents(5000), retained: Money.ofCents(1999) }
        : { name, reference, statusLink, reason }

    expect((await renderEmail(template)).text).toContain(reason)
  })

  it("names the processing fee in the correction email, next to the cancel option", async () => {
    const { text } = await renderEmail({ name: "correctionRequired", reference, statusLink, reason: "Grund." })

    expect(text).toMatch(/stornieren/i)
    expect(text).toMatch(/19,99\s€/)
  })
})
