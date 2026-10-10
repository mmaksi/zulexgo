import { betaOf, fakeIdentityProblem, parseEnv, parseSales, ZULEX_BASE_URLS } from "./env"

const dev = { APP_ENV: "dev" }

const staging = {
  APP_ENV: "staging",
  APP_BASE_URL: "https://zulexgo-staging.vercel.app",
  CRON_SECRET: "staging-cron-secret",
}

const production = {
  APP_ENV: "production",
  APP_BASE_URL: "https://zulexgo.de",
  CRON_SECRET: "production-cron-secret",
  PAYMENT_DRIVER: "stripe",
  STRIPE_SECRET_KEY: "sk_live_placeholder",
  STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_placeholder",
  REGISTRATION_DRIVER: "zulex",
  ZULEX_BASE_URL: ZULEX_BASE_URLS.production,
  ZULEX_API_KEY: "zulex-placeholder",
  MAIL_DRIVER: "resend",
  RESEND_API_KEY: "re_placeholder",
  MAIL_FROM: "ZulexGO <status@mail.example.test>",
  REPOSITORY_DRIVER: "postgres",
  DATABASE_URL: "postgresql://pooler.example.test/zulexgo",
  DIRECT_DATABASE_URL: "postgresql://direct.example.test/zulexgo",
  CODES_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  STORAGE_DRIVER: "supabase",
  SUPABASE_STORAGE_URL: "https://storage.example.test",
  SUPABASE_STORAGE_BUCKET: "documents",
  SUPABASE_STORAGE_SERVICE_KEY: "service-placeholder",
}

describe("APP_ENV", () => {
  it("is the only stage switch and must be one of the three stages", () => {
    expect(() => parseEnv({ APP_ENV: "prod" })).toThrow(/APP_ENV/)
  })

  it("names APP_ENV when it is missing entirely", () => {
    expect(() => parseEnv({})).toThrow(/APP_ENV/)
  })

  it("treats a blank value as absent rather than as a valid empty string", () => {
    expect(() => parseEnv({ APP_ENV: "  " })).toThrow(/APP_ENV/)
  })
})

describe("dev", () => {
  it("boots with no secrets at all, on fakes", () => {
    expect(parseEnv(dev)).toMatchObject({
      APP_ENV: "dev",
      PAYMENT_DRIVER: "fake",
      REGISTRATION_DRIVER: "fake",
      MAIL_DRIVER: "console",
      REPOSITORY_DRIVER: "fake",
      STORAGE_DRIVER: "fake",
      IDENTITY_DRIVER: "fake",
    })
  })

  it("defaults APP_BASE_URL to localhost", () => {
    expect(parseEnv(dev).APP_BASE_URL).toBe("http://localhost:3000")
  })
})

describe("stripe key guardrails", () => {
  it("rejects a live secret key outside production", () => {
    expect(() =>
      parseEnv({
        ...staging,
        PAYMENT_DRIVER: "stripe",
        STRIPE_SECRET_KEY: "sk_live_placeholder",
        STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_placeholder",
        MAIL_ALLOWLIST: "qa@example.test",
      })
    ).toThrow(/STRIPE_SECRET_KEY[\s\S]*live/i)
  })

  it("rejects a live key in dev too", () => {
    expect(() =>
      parseEnv({ ...dev, PAYMENT_DRIVER: "stripe", STRIPE_SECRET_KEY: "sk_live_placeholder", STRIPE_WEBHOOK_SECRET: "w", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_x" })
    ).toThrow(/STRIPE_SECRET_KEY/)
  })

  it("rejects a test secret key in production", () => {
    expect(() => parseEnv({ ...production, STRIPE_SECRET_KEY: "sk_test_placeholder" })).toThrow(
      /STRIPE_SECRET_KEY[\s\S]*test/i
    )
  })

  it("rejects a live publishable key outside production", () => {
    expect(() =>
      parseEnv({
        ...staging,
        PAYMENT_DRIVER: "stripe",
        STRIPE_SECRET_KEY: "sk_test_placeholder",
        STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_placeholder",
        MAIL_ALLOWLIST: "qa@example.test",
      })
    ).toThrow(/NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/)
  })

  it("accepts live keys in production", () => {
    expect(parseEnv(production).STRIPE_SECRET_KEY).toBe("sk_live_placeholder")
  })

  it("requires every stripe variable once PAYMENT_DRIVER is stripe", () => {
    expect(() => parseEnv({ ...staging, PAYMENT_DRIVER: "stripe" })).toThrow(
      /STRIPE_SECRET_KEY[\s\S]*STRIPE_WEBHOOK_SECRET[\s\S]*NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/
    )
  })
})

describe("zulex base url guardrails", () => {
  it("rejects the production host outside production", () => {
    expect(() =>
      parseEnv({ ...staging, REGISTRATION_DRIVER: "zulex", ZULEX_BASE_URL: ZULEX_BASE_URLS.production, ZULEX_API_KEY: "k" })
    ).toThrow(/ZULEX_BASE_URL/)
  })

  it("rejects the integration host in production", () => {
    expect(() => parseEnv({ ...production, ZULEX_BASE_URL: ZULEX_BASE_URLS.integration })).toThrow(
      /ZULEX_BASE_URL/
    )
  })

  it("rejects any host but integration outside production; Zulex has only the two", () => {
    for (const stage of [dev, staging]) {
      expect(() =>
        parseEnv({ ...stage, REGISTRATION_DRIVER: "zulex", ZULEX_BASE_URL: "https://zulex.example.test/v1", ZULEX_API_KEY: "k" })
      ).toThrow(/ZULEX_BASE_URL/)
    }
  })

  it("accepts the integration host on staging", () => {
    expect(
      parseEnv({ ...staging, REGISTRATION_DRIVER: "zulex", ZULEX_BASE_URL: ZULEX_BASE_URLS.integration, ZULEX_API_KEY: "k" })
        .ZULEX_BASE_URL
    ).toBe(ZULEX_BASE_URLS.integration)
  })

  it("requires the key once REGISTRATION_DRIVER is zulex", () => {
    expect(() => parseEnv({ ...staging, REGISTRATION_DRIVER: "zulex" })).toThrow(/ZULEX_API_KEY/)
  })
})

describe("production may not run on a fake", () => {
  it.each([
    ["PAYMENT_DRIVER", "fake"],
    ["REGISTRATION_DRIVER", "fake"],
    ["MAIL_DRIVER", "console"],
    ["REPOSITORY_DRIVER", "fake"],
    ["STORAGE_DRIVER", "fake"],
  ])("rejects %s=%s", (key, value) => {
    expect(() => parseEnv({ ...production, [key]: value })).toThrow(new RegExp(key))
  })
})

describe("services on sale", () => {
  it("is de-registration alone until the deployment says otherwise, on every stage", () => {
    expect(parseEnv(dev).SERVICES_ON_SALE).toEqual(["deregistration"])
    expect(parseEnv(staging).SERVICES_ON_SALE).toEqual(["deregistration"])
    expect(parseEnv(production).SERVICES_ON_SALE).toEqual(["deregistration"])
  })

  it("is read from a comma-separated list", () => {
    expect(parseEnv({ ...staging, SERVICES_ON_SALE: " deregistration, newRegistration " }).SERVICES_ON_SALE).toEqual([
      "deregistration",
      "newRegistration",
    ])
  })

  it.each(["addressChange", "registration", "deregistration,nonsense"])("rejects %s, which is no service an order can be made for", (list) => {
    expect(() => parseEnv({ ...staging, SERVICES_ON_SALE: list })).toThrow(/SERVICES_ON_SALE/)
  })

  it("lets staging sell Neuzulassung on the fake identity check, where nobody's identity matters", () => {
    expect(parseEnv({ ...staging, SERVICES_ON_SALE: "deregistration,newRegistration" }).SERVICES_ON_SALE).toContain("newRegistration")
  })

  it("keeps production from selling Neuzulassung on the fake identity check", () => {
    expect(() => parseEnv({ ...production, SERVICES_ON_SALE: "deregistration,newRegistration" })).toThrow(/IDENTITY_DRIVER/)
  })

  it("is readable without the rest of the environment, for the pages that are built ahead of any request", () => {
    expect(parseSales({ SERVICES_ON_SALE: "newRegistration" }).servicesOnSale).toEqual(["newRegistration"])
    expect(parseSales({}).servicesOnSale).toEqual(["deregistration"])
    expect(() => parseSales({ SERVICES_ON_SALE: "nonsense" })).toThrow(/SERVICES_ON_SALE/)
  })
})

describe("the beta", () => {
  const onSale = { ...staging, SERVICES_ON_SALE: "deregistration,newRegistration" }
  const inBeta = { ...onSale, BETA_SERVICES: "newRegistration", INVITE_CODES_NEW_REGISTRATION: "k7m2-qx9p, B4TA 0001" }

  it("has no service in it unless the deployment says so, and then everything on sale is open to everyone", () => {
    expect(parseEnv(production).BETA_SERVICES).toEqual([])
    expect(betaOf(parseEnv(production))).toBeUndefined()
  })

  it("takes the services in beta, each with the codes that open it, written as a person would type them", () => {
    expect(betaOf(parseEnv(inBeta))).toEqual({ invites: { newRegistration: ["K7M2-QX9P", "B4TA0001"] }, dailyPlaces: 5 })
  })

  it("takes the day's places from BETA_DAILY_CAP", () => {
    expect(betaOf(parseEnv({ ...inBeta, BETA_DAILY_CAP: "12" }))?.dailyPlaces).toBe(12)
  })

  it.each(["0", "-1", "2.5", "many"])("rejects BETA_DAILY_CAP=%s", (cap) => {
    expect(() => parseEnv({ ...inBeta, BETA_DAILY_CAP: cap })).toThrow(/BETA_DAILY_CAP/)
  })

  it("refuses a service in beta that has no invite codes, which nobody could order", () => {
    expect(() => parseEnv({ ...onSale, BETA_SERVICES: "newRegistration" })).toThrow(/INVITE_CODES_NEW_REGISTRATION/)
  })

  it("refuses codes for a service that is not in beta, which would leave it open to everyone", () => {
    expect(() => parseEnv({ ...onSale, INVITE_CODES_NEW_REGISTRATION: "K7M2-QX9P" })).toThrow(/INVITE_CODES_NEW_REGISTRATION/)
  })

  it("lets a service in beta be taken off sale by that change alone, so stopping sales never needs the beta settings touched too", () => {
    const env = parseEnv({ ...inBeta, SERVICES_ON_SALE: "deregistration" })

    expect(env.SERVICES_ON_SALE).toEqual(["deregistration"])
    expect(env.BETA_SERVICES).toEqual(["newRegistration"])
  })

  it("refuses a code that is too short to be hard to guess", () => {
    expect(() => parseEnv({ ...inBeta, INVITE_CODES_NEW_REGISTRATION: "K7M2-QX9P,abc123" })).toThrow(/INVITE_CODES_NEW_REGISTRATION/)
  })

  it("never puts a code in the error", () => {
    let message = ""
    try {
      parseEnv({ ...inBeta, INVITE_CODES_NEW_REGISTRATION: "K7M2-QX9P,abc123" })
    } catch (error) {
      message = String(error)
    }

    expect(message).toMatch(/INVITE_CODES_NEW_REGISTRATION/)
    expect(message).not.toMatch(/K7M2|ABC123/i)
  })

  it("names the services in beta without the rest of the environment, for the landing page", () => {
    expect(parseSales({ SERVICES_ON_SALE: "deregistration,newRegistration", BETA_SERVICES: "newRegistration" }).betaServices).toEqual(["newRegistration"])
    expect(parseSales({}).betaServices).toEqual([])
  })
})

// Provisional: launch plan Q45
describe("the identity check", () => {
  it("may be the fake in production while no service on sale verifies the customer, as today", () => {
    expect(parseEnv({ ...production, IDENTITY_DRIVER: "fake" }).IDENTITY_DRIVER).toBe("fake")
    expect(fakeIdentityProblem("production", ["deregistration"])).toBeUndefined()
  })

  it("may not be the fake in production once a service that verifies the customer is on sale", () => {
    expect(fakeIdentityProblem("production", ["deregistration", "newRegistration"])).toMatch(/newRegistration/)
  })

  it.each(["dev", "staging"] as const)("may be the fake in %s whatever is on sale, where nobody's identity matters", (stage) => {
    expect(fakeIdentityProblem(stage, ["deregistration", "newRegistration"])).toBeUndefined()
  })

  it("has no other driver yet: the Verimi adapter is not built", () => {
    expect(() => parseEnv({ ...dev, IDENTITY_DRIVER: "verimi" })).toThrow(/IDENTITY_DRIVER/)
  })
})

describe("mail", () => {
  it("never sends real mail from dev, where every address is seeded", () => {
    expect(() =>
      parseEnv({ ...dev, MAIL_DRIVER: "resend", RESEND_API_KEY: "re_x", MAIL_ALLOWLIST: "a@example.test" })
    ).toThrow(/MAIL_DRIVER/)
  })

  it("requires an allowlist on staging so a seeded address is never mailed", () => {
    expect(() => parseEnv({ ...staging, MAIL_DRIVER: "resend", RESEND_API_KEY: "re_x" })).toThrow(
      /MAIL_ALLOWLIST/
    )
  })

  it("rejects an allowlist in production, which would silently drop customer mail", () => {
    expect(() => parseEnv({ ...production, MAIL_ALLOWLIST: "qa@example.test" })).toThrow(/MAIL_ALLOWLIST/)
  })

  it("parses the allowlist as a comma-separated list", () => {
    expect(
      parseEnv({ ...staging, MAIL_DRIVER: "resend", RESEND_API_KEY: "re_x", MAIL_FROM: "z@example.test", MAIL_ALLOWLIST: "a@example.test, b@example.test" })
        .MAIL_ALLOWLIST
    ).toEqual(["a@example.test", "b@example.test"])
  })

  it("requires a sender address once MAIL_DRIVER is resend", () => {
    expect(() => parseEnv({ ...staging, MAIL_DRIVER: "resend", RESEND_API_KEY: "re_x", MAIL_ALLOWLIST: "a@example.test" })).toThrow(
      /MAIL_FROM/
    )
  })

  it("requires the provider key once MAIL_DRIVER is resend", () => {
    expect(() => parseEnv({ ...staging, MAIL_DRIVER: "resend", MAIL_ALLOWLIST: "a@example.test" })).toThrow(
      /RESEND_API_KEY/
    )
  })
})

describe("database and encryption", () => {
  it("requires both connection strings once REPOSITORY_DRIVER is postgres", () => {
    expect(() => parseEnv({ ...staging, REPOSITORY_DRIVER: "postgres" })).toThrow(
      /DATABASE_URL[\s\S]*DIRECT_DATABASE_URL/
    )
  })

  it("requires an encryption key for the codes stored in postgres", () => {
    expect(() =>
      parseEnv({ ...staging, REPOSITORY_DRIVER: "postgres", DATABASE_URL: "postgresql://a", DIRECT_DATABASE_URL: "postgresql://b" })
    ).toThrow(/CODES_ENCRYPTION_KEY/)
  })

  it("rejects an encryption key that is not 32 bytes", () => {
    expect(() =>
      parseEnv({ ...production, CODES_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString("base64") })
    ).toThrow(/CODES_ENCRYPTION_KEY/)
  })

  it("takes the database's CA certificate as PEM, and refuses at boot anything else pasted there", () => {
    const pem = "-----BEGIN CERTIFICATE-----\nMIIDxTCCAq2gAwIBAgIUfake\n-----END CERTIFICATE-----\n"

    expect(parseEnv({ ...production, DATABASE_CA_CERT: pem }).DATABASE_CA_CERT).toBe(pem)
    expect(() => parseEnv({ ...production, DATABASE_CA_CERT: "prod-ca-2021.crt" })).toThrow(/DATABASE_CA_CERT/)
  })

  it("restores the line breaks of a certificate pasted on one line with \\n escapes", () => {
    const oneLine = "-----BEGIN CERTIFICATE-----\\nMIIDxTCCAq2gAwIBAgIUfake\\n-----END CERTIFICATE-----\\n"

    expect(parseEnv({ ...production, DATABASE_CA_CERT: oneLine }).DATABASE_CA_CERT).toBe(
      "-----BEGIN CERTIFICATE-----\nMIIDxTCCAq2gAwIBAgIUfake\n-----END CERTIFICATE-----\n"
    )
  })
})

describe("storage", () => {
  it("requires every supabase variable once STORAGE_DRIVER is supabase", () => {
    expect(() => parseEnv({ ...staging, STORAGE_DRIVER: "supabase" })).toThrow(
      /SUPABASE_STORAGE_URL[\s\S]*SUPABASE_STORAGE_BUCKET[\s\S]*SUPABASE_STORAGE_SERVICE_KEY/
    )
  })
})

describe("deployed stages", () => {
  it("requires APP_BASE_URL and CRON_SECRET outside dev", () => {
    expect(() => parseEnv({ APP_ENV: "staging" })).toThrow(/APP_BASE_URL[\s\S]*CRON_SECRET/)
  })

  it("rejects a plaintext base url outside dev", () => {
    expect(() => parseEnv({ ...staging, APP_BASE_URL: "http://staging.example.test" })).toThrow(
      /APP_BASE_URL/
    )
  })

  it("accepts a fully configured production environment", () => {
    expect(parseEnv(production).APP_ENV).toBe("production")
  })
})

describe("failure reporting", () => {
  it("names every offending variable in one message rather than the first", () => {
    const message = (() => {
      try {
        parseEnv({ APP_ENV: "staging" })
        return ""
      } catch (error) {
        return (error as Error).message
      }
    })()

    expect(message).toContain("APP_BASE_URL")
    expect(message).toContain("CRON_SECRET")
  })

  it("never echoes the offending value, which may be a secret", () => {
    const message = (() => {
      try {
        parseEnv({ ...production, STRIPE_SECRET_KEY: "sk_test_super_secret_value" })
        return ""
      } catch (error) {
        return (error as Error).message
      }
    })()

    expect(message).toContain("STRIPE_SECRET_KEY")
    expect(message).not.toContain("super_secret_value")
  })
})
