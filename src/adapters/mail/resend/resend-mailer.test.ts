import { HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { anApplication } from "@/tests/fixtures/applications"
import { RESEND_TEST_API_KEY, ResendDouble } from "@/tests/msw/resend"
import { Money } from "@/src/core/domain/money"
import { mailerContract } from "@/src/core/ports/mailer.contract"
import { ResendMailer } from "./resend-mailer"

let resend = new ResendDouble()
const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
beforeEach(() => {
  resend = new ResendDouble()
  server.resetHandlers(...resend.handlers)
})
afterAll(() => server.close())

const FROM = "ZulexGO <status@mail.example.test>"
const mailer = (allowlist?: string[]) =>
  new ResendMailer({ apiKey: RESEND_TEST_API_KEY, from: FROM, allowlist, log: () => {} })

mailerContract("ResendMailer", () => mailer())

const { reference, email } = anApplication()
const statusLink = "https://zulexgo.example.test/status/faketoken-resend-test"
const orderConfirmation = { name: "orderConfirmation", reference, statusLink } as const

describe("ResendMailer", () => {
  it("sends the order confirmation with its status link, from our sender, keyed against resending", async () => {
    await mailer().send({ to: email, template: orderConfirmation, idempotencyKey: `${reference}/orderConfirmation/2` })

    expect(resend.delivered).toEqual([
      expect.objectContaining({
        from: FROM,
        to: [email],
        subject: expect.stringContaining(reference),
        html: expect.stringContaining(statusLink),
        text: expect.stringContaining(statusLink),
        idempotencyKey: `${reference}/orderConfirmation/2`,
      }),
    ])
  })

  it("delivers a retried message once", async () => {
    const message = { to: email, template: orderConfirmation, idempotencyKey: "same-key" }

    await mailer().send(message)
    await mailer().send(message)

    expect(resend.delivered).toHaveLength(1)
  })

  it("states the refunded amount in euros", async () => {
    await mailer().send({ to: email, template: { name: "refundIssued", reference, amount: Money.ofCents(5000) }, idempotencyKey: "r" })

    expect(resend.delivered[0].text).toMatch(/50,00\s€/)
  })

  it("states in the rejection email the amount that is returned", async () => {
    const rejected = { name: "rejected", reference, statusLink: "https://zulexgo.example.test/status/t", refund: Money.ofCents(5001) } as const

    await mailer().send({ to: email, template: rejected, idempotencyKey: "r" })

    expect(resend.delivered[0].text).toMatch(/50,01\s€/)
  })

  it("throws when Resend refuses the message, so the caller can retry", async () => {
    resend.failNext(HttpResponse.json({ statusCode: 403, name: "validation_error", message: "domain not verified" }, { status: 403 }))

    await expect(mailer().send({ to: email, template: orderConfirmation, idempotencyKey: "k" })).rejects.toThrow(/orderConfirmation/)
  })

  describe("on staging's allowlist", () => {
    it("drops a recipient not on the list without calling Resend", async () => {
      await mailer(["qa@example.test"]).send({ to: email, template: orderConfirmation, idempotencyKey: "k" })

      expect(resend.delivered).toEqual([])
    })

    it("sends to a listed recipient, whatever the case of the listed address", async () => {
      await mailer([email.toUpperCase()]).send({ to: email, template: orderConfirmation, idempotencyKey: "k" })

      expect(resend.delivered).toHaveLength(1)
    })
  })
})
