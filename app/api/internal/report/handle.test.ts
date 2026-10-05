import type { OrdersReport } from "@/src/core/use-cases/monitoring/report-orders"
import { handleReport } from "./handle"

const SECRET = "fake-cron-secret"
const NOW = new Date("2026-03-10T12:00:00.000Z")
const report = jest.fn(async (days: number) => ({ generatedAt: NOW, since: new Date(NOW.getTime() - days * 86_400_000), services: {} as OrdersReport["services"] }))
const request = (authorization?: string, query = "") =>
  new Request(`https://zulexgo.example.test/api/internal/report${query}`, { headers: authorization ? { authorization } : {} })
const authorized = `Bearer ${SECRET}`

beforeEach(() => report.mockClear())

describe("the monitoring report", () => {
  it("answers with the report of the last 30 days when called with the cron secret", async () => {
    const response = await handleReport({ cronSecret: SECRET, report }, request(authorized))

    expect(response.status).toBe(200)
    expect(report).toHaveBeenCalledWith(30)
    expect(await response.json()).toMatchObject({ generatedAt: NOW.toISOString(), since: "2026-02-08T12:00:00.000Z" })
  })

  it("is never kept by a cache: it is read to see what is happening now", async () => {
    const response = await handleReport({ cronSecret: SECRET, report }, request(authorized))

    expect(response.headers.get("cache-control")).toBe("no-store")
  })

  it("takes the number of days to look back from the query", async () => {
    await handleReport({ cronSecret: SECRET, report }, request(authorized, "?days=7"))

    expect(report).toHaveBeenCalledWith(7)
  })

  it.each(["0", "-3", "366", "1.5", "week", ""])("refuses days=%p as a bad request, without reading anything", async (days) => {
    const response = await handleReport({ cronSecret: SECRET, report }, request(authorized, `?days=${days}`))

    expect(response.status).toBe(400)
    expect(report).not.toHaveBeenCalled()
  })

  it.each([undefined, "Bearer wrong", SECRET, `Bearer ${SECRET}x`])("refuses %p without reading anything", async (authorization) => {
    const response = await handleReport({ cronSecret: SECRET, report }, request(authorization))

    expect(response.status).toBe(401)
    expect(report).not.toHaveBeenCalled()
  })

  it("refuses everyone when no secret is configured", async () => {
    expect((await handleReport({ cronSecret: undefined, report }, request("Bearer "))).status).toBe(401)
    expect(report).not.toHaveBeenCalled()
  })

  it("answers a failed read as unavailable, without saying why", async () => {
    const failing = jest.fn(async () => {
      throw new Error("connection string with a secret")
    })
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined)

    const response = await handleReport({ cronSecret: SECRET, report: failing }, request(authorized))

    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain("secret")
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret")
    log.mockRestore()
  })
})
