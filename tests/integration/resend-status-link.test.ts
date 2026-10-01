import { anApplication, FAKE_REQUEST } from "@/tests/fixtures/applications"
import { FakeClock } from "@/src/adapters/clock/fake/fake-clock"
import { renderEmail } from "@/src/adapters/mail/resend/render"
import { FakeMailer } from "@/src/adapters/mail/fake/fake-mailer"
import { InMemoryRateLimiter } from "@/src/adapters/rate-limit/fake/in-memory-rate-limiter"
import { InMemoryApplicationRepository } from "@/src/adapters/repository/fake/in-memory-application-repository"
import { FakeTokenGenerator } from "@/src/adapters/tokens/fake/fake-token-generator"
import { limitResend, resendStatusLink } from "@/src/core/use-cases/resend-status-link"

const HOUR = 60 * 60_000
const OLD_TOKEN = "faketoken-original-link"

const order = anApplication({ status: "submitted_to_kba" })
const unpaid = anApplication({ status: "awaiting_payment" })

function setup() {
  const clock = new FakeClock()
  const deps = {
    repository: new InMemoryApplicationRepository([{ application: order, statusToken: OLD_TOKEN }, { application: unpaid }]),
    mailer: new FakeMailer(),
    tokens: new FakeTokenGenerator(),
    rateLimiter: new InMemoryRateLimiter(clock),
    clock,
    statusLink: (token: string) => `https://zulexgo.example.test/status/${token}`,
  }
  return { deps, clock }
}

describe("resending a status link", () => {
  it("mails a new link to the address on file and revokes the old one", async () => {
    const { deps } = setup()

    await resendStatusLink(deps, { reference: order.reference, email: order.email })

    const [message] = deps.mailer.sent
    expect(message).toMatchObject({ to: order.email, template: { name: "statusLinkResent", reference: order.reference } })
    const link = (message.template as { statusLink: string }).statusLink
    const token = link.split("/").pop()!
    expect(token).not.toBe(OLD_TOKEN)
    expect(await deps.repository.findByStatusToken(OLD_TOKEN)).toBeUndefined()
    expect((await deps.repository.findByStatusToken(token))?.reference).toBe(order.reference)
  })

  it("makes every later email carry the new link", async () => {
    const { deps } = setup()

    await resendStatusLink(deps, { reference: order.reference, email: order.email })

    const [{ template }] = deps.mailer.sent
    expect(await deps.repository.getStatusToken(order.reference)).toBe((template as { statusLink: string }).statusLink.split("/").pop())
  })

  it.each([
    ["the wrong email", order.reference, "someone.else@example.test"],
    ["an unknown order", "ZG-ZZZZZZ", order.email],
    ["the right email in other letters", order.reference.toLowerCase(), order.email.toUpperCase()],
  ])("with %s, %s", async (label, reference, email) => {
    const { deps } = setup()

    await resendStatusLink(deps, { reference, email })

    const matched = label === "the right email in other letters"
    expect(deps.mailer.sent).toHaveLength(matched ? 1 : 0)
    if (!matched) expect((await deps.repository.findByStatusToken(OLD_TOKEN))?.reference).toBe(order.reference)
  })

  it("never mails the address that was typed, only the one on file", async () => {
    const { deps } = setup()

    await resendStatusLink(deps, { reference: order.reference, email: "someone.else@example.test" })
    await resendStatusLink(deps, { reference: order.reference, email: order.email })

    expect(deps.mailer.sent.map(({ to }) => to)).toEqual([order.email])
  })

  it("makes no link for an order that has not paid, since it has none", async () => {
    const { deps } = setup()

    await resendStatusLink(deps, { reference: unpaid.reference, email: unpaid.email })

    expect(deps.mailer.sent).toEqual([])
    expect(await deps.repository.getStatusToken(unpaid.reference)).toBeUndefined()
  })

  it("keeps the old link working when the email cannot be sent, so nobody is locked out", async () => {
    const { deps } = setup()
    jest.spyOn(deps.mailer, "send").mockRejectedValueOnce(new Error("Resend refused the message"))

    await expect(resendStatusLink(deps, { reference: order.reference, email: order.email })).rejects.toThrow("Resend refused")

    expect((await deps.repository.findByStatusToken(OLD_TOKEN))?.reference).toBe(order.reference)
  })

  it("names no security code, and links only to the new status link", async () => {
    const { deps } = setup()
    await resendStatusLink(deps, { reference: order.reference, email: order.email })

    const { subject, html, text } = await renderEmail(deps.mailer.sent[0].template)

    for (const code of Object.values(FAKE_REQUEST.codes)) expect(`${subject}${html}${text}`).not.toContain(code)
    const links = [...html.matchAll(/href="(https?:[^"]*)"/g)].map(([, href]) => href)
    expect(links).toEqual([(deps.mailer.sent[0].template as { statusLink: string }).statusLink])
  })
})

describe("limiting resend requests", () => {
  const ask = (deps: ReturnType<typeof setup>["deps"], address: string, reference: string = order.reference) =>
    limitResend(deps, { address, reference })

  it("allows a few requests an hour from one address, then says how long to wait", async () => {
    const { deps, clock } = setup()
    for (let request = 0; request < 5; request += 1) expect(await ask(deps, "203.0.113.7", `ZG-00000${request}`)).toEqual({ allowed: true })

    clock.advance(20 * 60_000)

    expect(await ask(deps, "203.0.113.7", "ZG-000009")).toEqual({ allowed: false, retryAfterMs: 40 * 60_000 })
    expect(await ask(deps, "198.51.100.9", "ZG-000009")).toEqual({ allowed: true })
  })

  it("allows an order only a few requests an hour whoever asks, so its owner's inbox cannot be flooded", async () => {
    const { deps, clock } = setup()
    for (let request = 0; request < 3; request += 1) expect(await ask(deps, `198.51.100.${request}`)).toEqual({ allowed: true })

    expect(await ask(deps, "198.51.100.99")).toMatchObject({ allowed: false })
    clock.advance(HOUR)
    expect(await ask(deps, "198.51.100.99")).toEqual({ allowed: true })
  })

  it("treats a reference in other letters as the same order", async () => {
    const { deps } = setup()
    for (let request = 0; request < 3; request += 1) await ask(deps, `198.51.100.${request}`, order.reference.toLowerCase())

    expect(await ask(deps, "198.51.100.99", order.reference)).toMatchObject({ allowed: false })
  })
})
