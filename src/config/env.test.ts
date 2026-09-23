import { parseEnv, ZULEX_BASE_URLS } from "./env"

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

describe("mail", () => {
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
      parseEnv({ ...staging, MAIL_DRIVER: "resend", RESEND_API_KEY: "re_x", MAIL_ALLOWLIST: "a@example.test, b@example.test" })
        .MAIL_ALLOWLIST
    ).toEqual(["a@example.test", "b@example.test"])
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
