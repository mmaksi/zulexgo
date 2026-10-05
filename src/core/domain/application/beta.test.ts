import { mayOrder, normaliseInvite, type Beta } from "./beta"

const beta: Beta = { invites: { newRegistration: ["K7M2-QX9P", "B4TA-0001"] }, dailyPlaces: 5 }

describe("who may order a service in its beta", () => {
  it("is anyone, with or without a code, for a service outside the beta", () => {
    expect(mayOrder(beta, "deregistration", undefined)).toBe(true)
    expect(mayOrder(beta, "deregistration", "anything")).toBe(true)
    expect(mayOrder(undefined, "newRegistration", undefined)).toBe(true)
  })

  it("is whoever holds one of the service's invite codes", () => {
    expect(mayOrder(beta, "newRegistration", "K7M2-QX9P")).toBe(true)
    expect(mayOrder(beta, "newRegistration", "B4TA-0001")).toBe(true)
  })

  it.each([undefined, null, "", "   ", 7, {}, ["K7M2-QX9P"], "K7M2", "K7M2-QX9P-extra", "NOPE-NOPE"])("is nobody holding %p", (invite) => {
    expect(mayOrder(beta, "newRegistration", invite)).toBe(false)
  })

  it("does not care how the code was typed: case and spaces", () => {
    expect(mayOrder(beta, "newRegistration", "  k7m2-qx9p ")).toBe(true)
    expect(mayOrder(beta, "newRegistration", "K7M2 -QX9P")).toBe(true)
  })

  it("keeps each service's codes to itself", () => {
    const both: Beta = { invites: { newRegistration: ["K7M2-QX9P"], deregistration: ["DEREG-0001"] }, dailyPlaces: 5 }

    expect(mayOrder(both, "deregistration", "K7M2-QX9P")).toBe(false)
    expect(mayOrder(both, "newRegistration", "DEREG-0001")).toBe(false)
  })
})

describe("normaliseInvite", () => {
  it("reads a code the way it is stored: upper case, no spaces", () => {
    expect(normaliseInvite(" k7m2 qx9p ")).toBe("K7M2QX9P")
  })

  it("reads anything that is not text as no code", () => {
    expect(normaliseInvite(undefined)).toBe("")
    expect(normaliseInvite(12)).toBe("")
  })
})
