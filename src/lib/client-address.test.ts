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

  describe("IPv6", () => {
    it("counts a whole /64 as one caller, since one subscriber holds all of it", () => {
      expect(from({ "x-forwarded-for": "2001:db8:aaaa:bbbb:1:2:3:4" })).toBe(from({ "x-forwarded-for": "2001:DB8:aaaa:bbbb::9" }))
      expect(from({ "x-forwarded-for": "2001:db8:aaaa:bbbb::1" })).not.toBe(from({ "x-forwarded-for": "2001:db8:aaaa:cccc::1" }))
    })

    it("reads the short forms", () => {
      expect(from({ "x-forwarded-for": "::1" })).toBe(from({ "x-forwarded-for": "0:0:0:0:0:0:0:1" }))
      expect(from({ "x-forwarded-for": "2001:db8::" })).toBe(from({ "x-forwarded-for": "2001:db8:0:0:0:0:0:0" }))
    })

    it("treats an IPv4 address carried in IPv6 as the IPv4 address", () => {
      expect(from({ "x-forwarded-for": "::ffff:203.0.113.7" })).toBe("203.0.113.7")
    })

    it("leaves what it cannot read as it came", () => {
      expect(from({ "x-forwarded-for": "not-an-address:::" })).toBe("not-an-address:::")
    })
  })
})
