import { handlePoll } from "./handle"

const SECRET = "fake-cron-secret"
const poll = jest.fn(async () => ({ checked: 3, failed: 1 }))
const request = (authorization?: string) =>
  new Request("https://zulexgo.example.test/api/internal/poll", { headers: authorization ? { authorization } : {} })

beforeEach(() => poll.mockClear())

describe("the poll heartbeat", () => {
  it("advances due applications when called with the cron secret", async () => {
    const response = await handlePoll({ cronSecret: SECRET, poll }, request(`Bearer ${SECRET}`))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ checked: 3, failed: 1 })
  })

  it.each([undefined, "Bearer wrong", SECRET, `Bearer ${SECRET}x`])("refuses %p without polling", async (authorization) => {
    const response = await handlePoll({ cronSecret: SECRET, poll }, request(authorization))

    expect(response.status).toBe(401)
    expect(poll).not.toHaveBeenCalled()
  })

  it("refuses everyone when no secret is configured", async () => {
    expect((await handlePoll({ cronSecret: undefined, poll }, request("Bearer "))).status).toBe(401)
    expect(poll).not.toHaveBeenCalled()
  })
})
