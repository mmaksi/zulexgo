import { anApplication } from "@/tests/fixtures/applications"
import type { Application } from "@/src/core/domain/application"
import { RATE_LIMITS } from "@/src/core/domain/rate-limits"
import type { MailMessage } from "@/src/core/ports/mailer"
import type { RateLimit, RateLimitDecision } from "@/src/core/ports/rate-limiter"
import { requestStatusLink } from "./request"

const order = anApplication({ status: "submitted_to_kba" })
const headers = new Headers({ "x-forwarded-for": "203.0.113.7" })

function setup(options: { limit?: RateLimitDecision; known?: Application } = {}) {
  const sent: MailMessage[] = []
  const consume = jest.fn<Promise<RateLimitDecision>, [string, RateLimit]>(async () => options.limit ?? { allowed: true })
  const get = jest.fn(async (reference: string) => (reference === options.known?.reference ? options.known : undefined))
  const deps = {
    repository: { get, setStatusToken: jest.fn(async () => {}) },
    mailer: { send: jest.fn(async (message: MailMessage) => void sent.push(message)) },
    tokens: { generate: () => "faketoken-request-test" },
    rateLimiter: { consume },
    statusLink: (token: string) => `https://zulexgo.example.test/status/${token}`,
  }
  const tasks: (() => Promise<void>)[] = []
  const later = (task: () => Promise<void>) => void tasks.push(task)
  return { deps, consume, get, sent, tasks, later }
}

const submit = (world: ReturnType<typeof setup>, reference: string, email: string) =>
  requestStatusLink(world.deps as never, headers, { reference, email }, world.later)

describe("requestStatusLink", () => {
  it.each([
    ["no reference", "", order.email, { reference: expect.any(String) }],
    ["a reference that cannot be one", "ZG-12", order.email, { reference: expect.any(String) }],
    ["no email", order.reference, "", { email: expect.any(String) }],
    ["something that is not an email", order.reference, "not-an-email", { email: expect.any(String) }],
  ])("asks for %s again, without counting or sending anything", async (_, reference, email, errors) => {
    const world = setup()

    const result = await submit(world, reference, email)

    expect(result).toEqual({ status: "invalid", errors })
    expect(world.consume).not.toHaveBeenCalled()
    expect(world.tasks).toEqual([])
  })

  it("answers at once and does its work afterwards, so the answer cannot tell whether the order exists", async () => {
    const known = setup({ known: order })
    const unknown = setup()

    const [a, b] = await Promise.all([submit(known, order.reference, order.email), submit(unknown, order.reference, order.email)])

    expect(a).toEqual({ status: "accepted" })
    expect(b).toEqual(a)
    expect(known.get).not.toHaveBeenCalled()
    expect(known.tasks).toHaveLength(1)
    expect(unknown.tasks).toHaveLength(1)
  })

  it("sends the link, once the scheduled work runs, only to a matching order", async () => {
    const world = setup({ known: order })

    await submit(world, order.reference, order.email)
    await world.tasks[0]()

    expect(world.sent.map(({ to }) => to)).toEqual([order.email])
  })

  it("counts the request against the caller's address and the order before scheduling anything", async () => {
    const world = setup()

    await submit(world, order.reference.toLowerCase(), order.email)

    expect(world.consume.mock.calls).toEqual([
      ["resend-link:address:203.0.113.7", RATE_LIMITS.resendLinkPerAddress],
      [`resend-link:order:${order.reference}`, RATE_LIMITS.resendLinkPerOrder],
    ])
  })

  it("tells a caller over the limit how long to wait, and does nothing", async () => {
    const world = setup({ limit: { allowed: false, retryAfterMs: 40 * 60_000 + 1 } })

    const result = await submit(world, order.reference, order.email)

    expect(result).toEqual({ status: "limited", retryAfterMinutes: 41 })
    expect(world.tasks).toEqual([])
  })

  it("logs a failed send without the address or the order, and never surfaces it", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {})
    const world = setup({ known: order })
    world.deps.mailer.send.mockRejectedValueOnce(new Error(`Resend refused ${order.email}`))

    await submit(world, order.reference, order.email)
    await expect(world.tasks[0]()).resolves.toBeUndefined()

    const logged = error.mock.calls.flat().join(" ")
    expect(logged).toContain("resend-link")
    expect(logged).not.toContain(order.email)
    expect(logged).not.toContain(order.reference)
    error.mockRestore()
  })
})
