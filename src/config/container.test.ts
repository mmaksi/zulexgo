import { clockContract } from "@/src/core/ports/clock.contract"
import { tokenGeneratorContract } from "@/src/core/ports/token-generator.contract"
import { ZULEX_BASE_URLS } from "./env"
import { createContainer } from "./container"

const dev = { APP_ENV: "dev" }

describe("createContainer", () => {
  it("boots a dev container from nothing but APP_ENV", () => {
    expect(createContainer(dev).env.APP_ENV).toBe("dev")
  })

  it("refuses to build a container for an invalid environment", () => {
    expect(() =>
      createContainer({
        APP_ENV: "staging",
        APP_BASE_URL: "https://zulexgo-staging.vercel.app",
        CRON_SECRET: "x",
        PAYMENT_DRIVER: "stripe",
        STRIPE_SECRET_KEY: "sk_live_placeholder",
        STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_placeholder",
      })
    ).toThrow(/STRIPE_SECRET_KEY/)
  })

  it("refuses a staging container pointed at the Zulex production host", () => {
    expect(() =>
      createContainer({
        APP_ENV: "staging",
        APP_BASE_URL: "https://zulexgo-staging.vercel.app",
        CRON_SECRET: "x",
        REGISTRATION_DRIVER: "zulex",
        ZULEX_BASE_URL: ZULEX_BASE_URLS.production,
        ZULEX_API_KEY: "k",
      })
    ).toThrow(/ZULEX_BASE_URL/)
  })
})

clockContract("container clock", () => createContainer(dev).clock)
tokenGeneratorContract("container tokens", () => createContainer(dev).tokens)
