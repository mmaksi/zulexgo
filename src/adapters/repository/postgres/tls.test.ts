import { tlsFor } from "./tls"

const CA = "-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----"

describe("tlsFor", () => {
  it.each(["postgres://postgres@127.0.0.1:55432/postgres", "postgres://postgres@localhost/postgres", "postgres://postgres@[::1]:5432/postgres"])(
    "reaches a database on this machine in plain text: %s",
    (url) => {
      expect(tlsFor(url, CA)).toBe(false)
    },
  )

  it("encrypts the link to any other database and checks its certificate against the CA", () => {
    expect(tlsFor("postgres://user:pass@aws-0-eu-central-1.pooler.supabase.com:6543/postgres", CA)).toEqual({ ca: CA, rejectUnauthorized: true })
  })

  it("still encrypts without a CA, though it cannot check who answers", () => {
    expect(tlsFor("postgres://user:pass@aws-0-eu-central-1.pooler.supabase.com:6543/postgres")).toEqual({ rejectUnauthorized: false })
  })

  it("refuses a string that is no URL without repeating it, so the password stays out of the boot log", () => {
    const broken = "postgres://user:s3cret#pass@host:6543/postgres"
    let thrown: unknown
    try {
      tlsFor(broken)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeDefined()
    expect(JSON.stringify(thrown, Object.getOwnPropertyNames(thrown))).not.toContain("s3cret")
  })
})
