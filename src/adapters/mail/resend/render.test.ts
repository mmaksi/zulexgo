import { aNewRegistrationApplication } from "@/tests/fixtures/applications"
import { secretsOf } from "@/tests/fixtures/secrets"
import { EVERY_TEMPLATE, labelOf, NEW_REGISTRATION_TEMPLATES } from "@/src/core/ports/mail/mailer.contract"
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
      // Only the two emails that send the customer to verify link anywhere but to the order's status page.
      const links = "verificationLink" in template ? [template.verificationLink] : "statusLink" in template ? [template.statusLink] : []
      expect(hrefsIn(html).filter((href) => href.startsWith("http"))).toEqual(links)
    },
  )

  it.each(EVERY_TEMPLATE.map((template) => [template.name, template] as const))("%s: reviewed HTML", async (_, template) => {
    expect((await renderEmail(template)).html).toMatchSnapshot()
  })

  it("keeps the body of each email under the limit, without the fixed greeting and footer", async () => {
    for (const template of [...EVERY_TEMPLATE, ...NEW_REGISTRATION_TEMPLATES]) {
      const { text } = await renderEmail(template)
      const body = text.split("\n\n").slice(2, -1).join("\n\n")
      expect(body.length).toBeLessThanOrEqual(BODY_LIMIT)
    }
  })

  describe("the KBA email", () => {
    const submitted = (manualProcessing: boolean): EmailTemplate => ({ name: "submittedToKba", service: "deregistration", reference, statusLink, manualProcessing })

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
      service: "deregistration",
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

  describe("the identity verification emails", () => {
    const verificationLink = "https://verification.example.test/fake-verification-render-test"
    // 10:00 in Berlin on 5 March, 11:00 on 5 July (daylight saving), whatever zone the test runs in.
    const winter = new Date("2026-03-05T09:00:00.000Z")
    const summer = new Date("2026-07-05T09:00:00.000Z")
    const requested = (deadline: Date): EmailTemplate => ({ name: "identityVerificationRequested", reference, verificationLink, deadline })

    it("names the deadline in German, in Berlin time", async () => {
      expect((await renderEmail(requested(winter))).text).toContain("5. März 2026, 10:00 Uhr")
      expect((await renderEmail(requested(summer))).text).toContain("5. Juli 2026, 11:00 Uhr")
    })

    it.each(["identityVerificationRequested", "identityVerificationReminder"] as const)(
      "%s: says what happens if the customer does not verify in time, and that everything goes back",
      async (name) => {
        const { text } = await renderEmail({ name, reference, verificationLink, deadline: winter })

        expect(text).toMatch(/stornieren/)
        expect(text).toMatch(/vollen Betrag/)
      },
    )
  })

  it.each(["correctionRequired", "rejected"] as const)("says in the %s email why the application failed", async (name) => {
    const reason = "Die Fahrzeug-Identifizierungsnummer stimmt nicht."
    const template: EmailTemplate =
      name === "rejected"
        ? { name, service: "deregistration", reference, statusLink, reason, refund: Money.ofCents(5000), retained: Money.ofCents(1999) }
        : { name, service: "deregistration", reference, statusLink, reason }

    expect((await renderEmail(template)).text).toContain(reason)
  })

  it("names the processing fee in the correction email, next to the cancel option", async () => {
    const { text } = await renderEmail({ name: "correctionRequired", service: "deregistration", reference, statusLink, reason: "Grund." })

    expect(text).toMatch(/stornieren/i)
    expect(text).toMatch(/19,99\s€/)
  })
})

describe("renderEmail, for a Neuzulassung", () => {
  const { reference } = NEW_REGISTRATION_TEMPLATES[0]
  const [confirmation, , , papers, mismatch] = NEW_REGISTRATION_TEMPLATES

  it.each(NEW_REGISTRATION_TEMPLATES.map((template) => [labelOf(template), template] as const))(
    "%s: a subject with the order id within the limit, a body within the limit, German, and no other link than the status link",
    async (_, template) => {
      const { subject, html, text } = await renderEmail(template)

      expect(subject).toContain(template.reference)
      expect(subject.length).toBeLessThanOrEqual(SUBJECT_LIMIT)
      expect(text.length).toBeLessThanOrEqual(BODY_LIMIT + 300)
      expect(html).toContain('lang="de"')
      expect(hrefsIn(html).filter((href) => href.startsWith("http"))).toEqual([(template as { statusLink: string }).statusLink])
    },
  )

  it.each(NEW_REGISTRATION_TEMPLATES.map((template) => [labelOf(template), template] as const))("%s: reviewed HTML", async (_, template) => {
    expect((await renderEmail(template)).html).toMatchSnapshot()
  })

  it("carries nothing the customer typed, in any email", async () => {
    const typed = secretsOf(aNewRegistrationApplication().request)

    for (const template of NEW_REGISTRATION_TEMPLATES) {
      const { html, text } = await renderEmail(template)
      for (const secret of typed) expect(html + text).not.toContain(secret)
    }
  })

  it("tells the customer in the first email that an identity check follows, before anything is filed", async () => {
    expect((await renderEmail(confirmation)).text).toMatch(/Identität/)
  })

  describe("the KBA email", () => {
    const submitted = (manualProcessing: boolean): EmailTemplate => ({ name: "submittedToKba", service: "newRegistration", reference, statusLink, manualProcessing })

    it("promises minutes to hours when the authority is online", async () => {
      expect((await renderEmail(submitted(false))).text).toMatch(/wenigen Minuten bis Stunden/)
    })

    it("warns of days when the authority works by hand", async () => {
      expect((await renderEmail(submitted(true))).text).toMatch(/einige Tage/)
    })
  })

  describe("the correction email", () => {
    it("says nothing was filed, and that the identity is checked again, when the person who verified is not the owner", async () => {
      const { text } = await renderEmail(mismatch)

      expect(text).toMatch(/noch nichts eingereicht/)
      expect(text).toMatch(/Identität/)
      expect(text).not.toMatch(/Zulassungsstelle konnte/)
    })

    it("asks for the eVB number and the Teil II when the registration service sent the order back", async () => {
      const { text } = await renderEmail(papers)

      expect(text).toMatch(/eVB/)
      expect(text).toMatch(/Teil II/)
      expect(text).not.toMatch(/noch nichts eingereicht/)
    })

    it.each([papers, mismatch])("names the processing fee next to the cancel option (%#)", async (template) => {
      const { text } = await renderEmail(template)

      expect(text).toMatch(/stornieren/i)
      expect(text).toMatch(/19,99\s€/)
    })
  })

  describe("the rejection email", () => {
    it("names the refund and the fee it keeps", async () => {
      const { text } = await renderEmail(NEW_REGISTRATION_TEMPLATES[5])

      expect(text).toMatch(/109,01\s€/)
      expect(text).toMatch(/19,99\s€/)
    })
  })
})
