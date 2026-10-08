import { anApplication } from "@/tests/fixtures/applications"
import { mailerContract } from "@/src/core/ports/mail/mailer.contract"
import { ConsoleMailer } from "./console-mailer"

mailerContract("ConsoleMailer", () => new ConsoleMailer({ revealStatusLinks: false, log: () => {} }))

describe("ConsoleMailer", () => {
  const token = "faketoken-console-mailer-test-0000000000001"
  const statusLink = `https://zulexgo.example.test/status/${token}`
  const { reference, email } = anApplication()

  const printed = async (revealStatusLinks: boolean) => {
    const lines: string[] = []
    await new ConsoleMailer({ revealStatusLinks, log: (line) => lines.push(line) }).send({
      to: email,
      template: { name: "orderConfirmation", service: "deregistration", reference, statusLink },
      idempotencyKey: "k",
    })
    return lines.join("\n")
  }

  it("prints the recipient, the email and the status link in dev, which is how dev opens the status page", async () => {
    const output = await printed(true)

    expect(output).toContain(email)
    expect(output).toContain("orderConfirmation")
    expect(output).toContain(statusLink)
  })

  it("keeps the status token out of the log everywhere else", async () => {
    const output = await printed(false)

    expect(output).toContain("orderConfirmation")
    expect(output).not.toContain(token)
  })

  describe("the verification link, which starts someone's identity check", () => {
    const verificationLink = "https://verification.example.test/fake-verification-console-test"

    const printedVerification = async (revealStatusLinks: boolean) => {
      const lines: string[] = []
      await new ConsoleMailer({ revealStatusLinks, log: (line) => lines.push(line) }).send({
        to: email,
        template: { name: "identityVerificationRequested", reference, verificationLink, deadline: new Date("2026-03-05T09:00:00.000Z") },
        idempotencyKey: "k",
      })
      return lines.join("\n")
    }

    it("is printed in dev, where nobody else can see the log and the fake link is the only way to try the step", async () => {
      expect(await printedVerification(true)).toContain(verificationLink)
    })

    it("is kept out of the log everywhere else", async () => {
      const output = await printedVerification(false)

      expect(output).toContain("identityVerificationRequested")
      expect(output).not.toContain("fake-verification-console-test")
    })
  })
})
