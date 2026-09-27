import { anApplication } from "@/tests/fixtures/applications"
import { mailerContract } from "@/src/core/ports/mailer.contract"
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
      template: { name: "orderConfirmation", reference, statusLink },
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
})
