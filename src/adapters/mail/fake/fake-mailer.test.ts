import { anApplication } from "@/tests/fixtures/applications"
import { mailerContract } from "@/src/core/ports/mail/mailer.contract"
import { FakeMailer } from "./fake-mailer"

mailerContract("FakeMailer", () => new FakeMailer())

describe("FakeMailer", () => {
  it("records what was sent, in order, so a test can assert one email per transition", async () => {
    const mailer = new FakeMailer()
    const { reference, email } = anApplication()
    const statusLink = "https://zulexgo.example.test/status/faketoken"

    await mailer.send({ to: email, template: { name: "orderConfirmation", service: "deregistration", reference, statusLink }, idempotencyKey: "k1" })
    await mailer.send({ to: email, template: { name: "completed", service: "deregistration", reference, statusLink }, idempotencyKey: "k2" })

    expect(mailer.sent.map((message) => message.template.name)).toEqual(["orderConfirmation", "completed"])
  })

  it("delivers a message once however often it is sent with the same key, as the real mailer does", async () => {
    const mailer = new FakeMailer()
    const { reference, email } = anApplication()
    const message = {
      to: email,
      template: { name: "completed", service: "deregistration", reference, statusLink: "https://zulexgo.example.test/status/faketoken" },
      idempotencyKey: "same",
    } as const

    await mailer.send(message)
    await mailer.send(message)

    expect(mailer.sent).toHaveLength(1)
  })

  // Resend answers 409 to a key it already holds with other content, so a retry that rebuilds its email must rebuild it identically.
  it("refuses a key that was already sent with other content, as the real mailer does, and delivers nothing", async () => {
    const mailer = new FakeMailer()
    const { reference, email } = anApplication()
    const link = (statusLink: string) => ({ to: email, template: { name: "completed", service: "deregistration", reference, statusLink }, idempotencyKey: "same" }) as const

    await mailer.send(link("https://zulexgo.example.test/status/first"))

    await expect(mailer.send(link("https://zulexgo.example.test/status/second"))).rejects.toThrow(/other content/)
    expect(mailer.sent).toHaveLength(1)
  })

  it("accepts the same key and the same content again, which is a retry", async () => {
    const mailer = new FakeMailer()
    const { reference, email } = anApplication()
    const deadline = new Date("2026-03-05T09:00:00.000Z")
    const message = { to: email, template: { name: "identityVerificationRequested", reference, verificationLink: "https://verification.example.test/v", deadline }, idempotencyKey: "k" } as const

    await mailer.send(message)
    await mailer.send({ ...message, template: { ...message.template, deadline: new Date(deadline) } })

    expect(mailer.sent).toHaveLength(1)
  })
})
