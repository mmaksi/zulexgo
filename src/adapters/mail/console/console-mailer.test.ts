import { anApplication } from "@/tests/fixtures/applications"
import { mailerContract } from "@/src/core/ports/mailer.contract"
import { ConsoleMailer } from "./console-mailer"

mailerContract("ConsoleMailer", () => new ConsoleMailer(() => {}))

describe("ConsoleMailer", () => {
  it("prints the recipient, the email and the status link, which is how dev opens the status page", async () => {
    const lines: string[] = []
    const mailer = new ConsoleMailer((line) => lines.push(line))
    const { reference, email } = anApplication()
    const statusLink = "https://zulexgo.example.test/status/faketoken-dev"

    await mailer.send({ to: email, template: { name: "orderConfirmation", reference, statusLink } })

    expect(lines.join("\n")).toEqual(expect.stringContaining(email))
    expect(lines.join("\n")).toEqual(expect.stringContaining("orderConfirmation"))
    expect(lines.join("\n")).toEqual(expect.stringContaining(statusLink))
  })
})
