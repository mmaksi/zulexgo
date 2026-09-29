import { clientAddress } from "./client-address"

const from = (headers: Record<string, string>) => clientAddress(new Headers(headers))

describe("clientAddress", () => {
  it("takes the first address a proxy chain reports", () => {
    expect(from({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })).toBe("203.0.113.7")
  })

  it("falls back to x-real-ip, then to a shared name when a request says nothing", () => {
    expect(from({ "x-real-ip": "203.0.113.8" })).toBe("203.0.113.8")
    expect(from({})).toBe("unknown")
    expect(from({ "x-forwarded-for": " " })).toBe("unknown")
  })
})
