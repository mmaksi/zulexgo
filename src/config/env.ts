import "server-only"
import { z } from "zod"

/**
 * The single place this application interprets `process.env`; the container
 * only hands it over.
 *
 * `next build` sets `NODE_ENV=production` for the staging build too, so the
 * stage is carried by `APP_ENV` and nothing else. Everything here fails at
 * boot, naming the variable, rather than halfway through a customer's checkout.
 */

export const STAGES = ["dev", "staging", "production"] as const
export type Stage = (typeof STAGES)[number]

/** From the Zulex API spec. A stage must never point at the other one's host. */
export const ZULEX_BASE_URLS = {
  integration: "https://integration-zulex.de/zulex-api/v1",
  production: "https://app.zulex.de/zulex-api/v1",
} as const

const CODES_KEY_BYTES = 32

const secret = z.string().min(1).optional()

const schema = z
  .object({
    APP_ENV: z.enum(STAGES),

    APP_BASE_URL: z.url().optional(),
    CRON_SECRET: secret,

    PAYMENT_DRIVER: z.enum(["fake", "stripe"]).default("fake"),
    REGISTRATION_DRIVER: z.enum(["fake", "zulex"]).default("fake"),
    MAIL_DRIVER: z.enum(["console", "resend"]).default("console"),
    REPOSITORY_DRIVER: z.enum(["fake", "postgres"]).default("fake"),
    STORAGE_DRIVER: z.enum(["fake", "supabase"]).default("fake"),

    STRIPE_SECRET_KEY: secret,
    STRIPE_WEBHOOK_SECRET: secret,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),

    ZULEX_BASE_URL: z.url().optional(),
    ZULEX_API_KEY: secret,

    RESEND_API_KEY: secret,
    MAIL_ALLOWLIST: z
      .string()
      .default("")
      .transform((list) => list.split(",").map((entry) => entry.trim()).filter(Boolean)),

    DATABASE_URL: secret,
    DIRECT_DATABASE_URL: secret,
    CODES_ENCRYPTION_KEY: secret,

    SUPABASE_STORAGE_URL: z.url().optional(),
    SUPABASE_STORAGE_BUCKET: z.string().min(1).optional(),
    SUPABASE_STORAGE_SERVICE_KEY: secret,
  })
  .superRefine(applyGuardrails)

export type Env = z.infer<typeof schema>

type Ctx = z.core.$RefinementCtx
type Parsed = z.core.output<typeof schema>

const reject = (ctx: Ctx, variable: keyof Parsed, message: string) =>
  ctx.addIssue({ code: "custom", path: [variable], message })

const requireAll = (ctx: Ctx, env: Parsed, variables: (keyof Parsed)[], because: string) => {
  for (const variable of variables) {
    if (!env[variable]) reject(ctx, variable, `required ${because}.`)
  }
}

function applyGuardrails(env: Parsed, ctx: Ctx) {
  const isProduction = env.APP_ENV === "production"

  requireDeployedStageVariables(env, ctx)
  rejectFakesInProduction(env, ctx, isProduction)
  checkPayment(env, ctx, isProduction)
  checkRegistration(env, ctx, isProduction)
  checkMail(env, ctx, isProduction)
  checkRepository(env, ctx)
  checkStorage(env, ctx)
}

function requireDeployedStageVariables(env: Parsed, ctx: Ctx) {
  if (env.APP_ENV === "dev") return

  requireAll(ctx, env, ["APP_BASE_URL", "CRON_SECRET"], `when APP_ENV is ${env.APP_ENV}`)

  if (env.APP_BASE_URL && !env.APP_BASE_URL.startsWith("https://")) {
    reject(ctx, "APP_BASE_URL", "must be https outside dev; one-time status links travel over it.")
  }
}

/** A deployed stage that quietly runs on a fake serves nobody and charges nobody. */
function rejectFakesInProduction(env: Parsed, ctx: Ctx, isProduction: boolean) {
  if (!isProduction) return

  const fakeDrivers = [
    ["PAYMENT_DRIVER", "fake"],
    ["REGISTRATION_DRIVER", "fake"],
    ["MAIL_DRIVER", "console"],
    ["REPOSITORY_DRIVER", "fake"],
    ["STORAGE_DRIVER", "fake"],
  ] as const

  for (const [variable, fake] of fakeDrivers) {
    if (env[variable] === fake) reject(ctx, variable, `may not be "${fake}" in production.`)
  }
}

function checkPayment(env: Parsed, ctx: Ctx, isProduction: boolean) {
  if (env.PAYMENT_DRIVER === "stripe") {
    requireAll(
      ctx,
      env,
      ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
      "when PAYMENT_DRIVER is stripe"
    )
  }

  checkStripeMode(ctx, "STRIPE_SECRET_KEY", env.STRIPE_SECRET_KEY, isProduction)
  checkStripeMode(ctx, "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, isProduction)
}

function checkStripeMode(ctx: Ctx, variable: keyof Parsed, key: string | undefined, isProduction: boolean) {
  if (!key) return

  if (key.includes("_live_") && !isProduction) {
    reject(ctx, variable, "a live Stripe key is only allowed when APP_ENV is production.")
  }
  if (key.includes("_test_") && isProduction) {
    reject(ctx, variable, "a test Stripe key cannot be used in production.")
  }
}

function checkRegistration(env: Parsed, ctx: Ctx, isProduction: boolean) {
  if (env.REGISTRATION_DRIVER === "zulex") {
    requireAll(ctx, env, ["ZULEX_BASE_URL", "ZULEX_API_KEY"], "when REGISTRATION_DRIVER is zulex")
  }

  if (!env.ZULEX_BASE_URL) return

  // Zulex has exactly two hosts: production for production, integration for everything else.
  const expected = isProduction ? ZULEX_BASE_URLS.production : ZULEX_BASE_URLS.integration

  if (env.ZULEX_BASE_URL !== expected) {
    reject(ctx, "ZULEX_BASE_URL", `must be the Zulex ${isProduction ? "production" : "integration"} host (${expected}) when APP_ENV is ${env.APP_ENV}.`)
  }
}

function checkMail(env: Parsed, ctx: Ctx, isProduction: boolean) {
  if (env.MAIL_DRIVER === "resend") {
    requireAll(ctx, env, ["RESEND_API_KEY"], "when MAIL_DRIVER is resend")
  }

  const sendsRealMail = env.MAIL_DRIVER !== "console"

  if (env.APP_ENV === "dev" && sendsRealMail) {
    reject(ctx, "MAIL_DRIVER", "must be console in dev, where every address is seeded and none may be mailed for real.")
  }
  if (env.APP_ENV === "staging" && sendsRealMail && env.MAIL_ALLOWLIST.length === 0) {
    reject(ctx, "MAIL_ALLOWLIST", "must list every address staging is allowed to mail, so seeded data cannot reach a real person.")
  }
  if (isProduction && env.MAIL_ALLOWLIST.length > 0) {
    reject(ctx, "MAIL_ALLOWLIST", "must be empty in production; an allowlist there silently drops customer mail.")
  }
}

function checkRepository(env: Parsed, ctx: Ctx) {
  if (env.REPOSITORY_DRIVER === "postgres") {
    requireAll(
      ctx,
      env,
      ["DATABASE_URL", "DIRECT_DATABASE_URL", "CODES_ENCRYPTION_KEY"],
      "when REPOSITORY_DRIVER is postgres"
    )
  }

  if (env.CODES_ENCRYPTION_KEY && Buffer.from(env.CODES_ENCRYPTION_KEY, "base64").length !== CODES_KEY_BYTES) {
    reject(ctx, "CODES_ENCRYPTION_KEY", `must be ${CODES_KEY_BYTES} base64-encoded bytes for AES-256-GCM.`)
  }
}

function checkStorage(env: Parsed, ctx: Ctx) {
  if (env.STORAGE_DRIVER !== "supabase") return

  requireAll(
    ctx,
    env,
    ["SUPABASE_STORAGE_URL", "SUPABASE_STORAGE_BUCKET", "SUPABASE_STORAGE_SERVICE_KEY"],
    "when STORAGE_DRIVER is supabase"
  )
}

export class EnvironmentError extends Error {
  constructor(problems: string[]) {
    super(`Invalid environment:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`)
    this.name = "EnvironmentError"
  }
}

export type EnvSource = Record<string, string | undefined>

/** Blank is how a deployment platform spells "unset"; zod should see it that way too. */
const withoutBlanks = (source: EnvSource): EnvSource =>
  Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ""))

const DEV_DEFAULTS = { APP_BASE_URL: "http://localhost:3000" } as const

export function parseEnv(source: EnvSource): Env {
  const provided = withoutBlanks(source)
  const candidate = provided.APP_ENV === "dev" ? { ...DEV_DEFAULTS, ...provided } : provided
  const result = schema.safeParse(candidate)

  if (result.success) return result.data

  // Every problem is reported against its variable; the value itself never appears.
  throw new EnvironmentError(
    result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
  )
}
