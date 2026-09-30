import { anApplication } from "@/tests/fixtures/applications"
import { mailerContract } from "@/src/core/ports/mailer.contract"
import { FakeMailer } from "./fake-mailer"

mailerContract("FakeMailer", () => new FakeMailer())

describe("FakeMailer", () => {
  it("records what was sent, in order, so a test can assert one email per transition", async () => {
    const mailer = new FakeMailer()
    const { reference, email } = anApplication()
    const statusLink = "https://zulexgo.example.test/status/faketoken"

    await mailer.send({ to: email, template: { name: "orderConfirmation", reference, statusLink }, idempotencyKey: "k1" })
    await mailer.send({ to: email, template: { name: "completed", reference, statusLink }, idempotencyKey: "k2" })

    expect(mailer.sent.map((message) => message.template.name)).toEqual(["orderConfirmation", "completed"])
  })

  it("delivers a message once however often it is sent with the same key, as the real mailer does", async () => {
    const mailer = new FakeMailer()
    const { reference, email } = anApplication()
    const message = {
      to: email,
      template: { name: "completed", reference, statusLink: "https://zulexgo.example.test/status/faketoken" },
      idempotencyKey: "same",
    } as const

    await mailer.send(message)
    await mailer.send(message)

    expect(mailer.sent).toHaveLength(1)
  })
})
