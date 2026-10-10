import "server-only"
import { z } from "zod"
import { requiresIdentityVerification } from "@/src/core/domain/application/application-status"
import { type Beta, MIN_INVITE_LENGTH, normaliseInvite } from "@/src/core/domain/application/beta"
import { isOrderable, type OrderableService, type Service } from "@/src/core/domain/application/service"

// The stage is APP_ENV, never NODE_ENV: `next build` sets NODE_ENV to "production" on staging too.
export const STAGES = ["dev", "staging", "production"] as const
export type Stage = (typeof STAGES)[number]

export const ZULEX_BASE_URLS = {
  integration: "https://integration-zulex.de/zulex-api/v1",
  production: "https://app.zulex.de/zulex-api/v1",
} as const

const CODES_KEY_BYTES = 32

const secret = z.string().min(1).optional()

const commaList = (list: string) => list.split(",").map((entry) => entry.trim()).filter(Boolean)

const inviteCodes = (list: string) => commaList(list).map(normaliseInvite)

const aesKey = z.string().refine((key) => Buffer.from(key, "base64").length === CODES_KEY_BYTES, `must be ${CODES_KEY_BYTES} base64-encoded bytes for AES-256-GCM.`)

// Read only, never written with: what an old key encrypted stays readable until `db reencrypt` rewrites it.
const retiredKeys = z.string().default("").transform(commaList).pipe(z.array(aesKey))

// Pasted on one line, the PEM's line breaks arrive as "\n" escapes, which TLS cannot read.
const databaseCaCert = z
  .string()
  .startsWith("-----BEGIN CERTIFICATE-----", "must be the PEM certificate itself, not a file name.")
  .transform((pem) => pem.replaceAll("\\n", "\n"))
  .optional()

const orderableService = z.custom<OrderableService>(isOrderable, { message: "is not a service an order can be made for." })

const salesFields = {
  SERVICES_ON_SALE: z.string().default("deregistration").transform(commaList).pipe(z.array(orderableService).min(1)),
  BETA_SERVICES: z.string().default("").transform(commaList).pipe(z.array(orderableService)),
  BETA_DAILY_CAP: z.coerce.number().int().min(1).default(5),
  // Invite codes are secrets: never in an error or a log.
  INVITE_CODES_DEREGISTRATION: z.string().default("").transform(inviteCodes),
  INVITE_CODES_NEW_REGISTRATION: z.string().default("").transform(inviteCodes),
}
const salesSchema = z.object(salesFields)

const schema = z
  .object({
    APP_ENV: z.enum(STAGES),

    ...salesFields,

    APP_BASE_URL: z.url().optional(),
    CRON_SECRET: secret,

    PAYMENT_DRIVER: z.enum(["fake", "stripe"]).default("fake"),
    REGISTRATION_DRIVER: z.enum(["fake", "zulex"]).default("fake"),
    MAIL_DRIVER: z.enum(["console", "resend"]).default("console"),
    REPOSITORY_DRIVER: z.enum(["fake", "postgres"]).default("fake"),
    STORAGE_DRIVER: z.enum(["fake", "supabase"]).default("fake"),
    // Fake only: the Verimi adapter waits on launch plan Q1–Q3.
    IDENTITY_DRIVER: z.enum(["fake"]).default("fake"),

    STRIPE_SECRET_KEY: secret,
    STRIPE_WEBHOOK_SECRET: secret,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),

    ZULEX_BASE_URL: z.url().optional(),
    ZULEX_API_KEY: secret,

    RESEND_API_KEY: secret,
    MAIL_FROM: z.string().min(1).optional(),
    MAIL_ALLOWLIST: z.string().default("").transform(commaList),

    // DATABASE_URL is the transaction pooler (the app); DIRECT_DATABASE_URL the session one (db commands).
    DATABASE_URL: secret,
    DIRECT_DATABASE_URL: secret,
    DATABASE_CA_CERT: databaseCaCert,
    CODES_ENCRYPTION_KEY: secret,
    RETIRED_CODES_ENCRYPTION_KEYS: retiredKeys,

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
  checkIdentity(env, ctx)
  checkBeta(env, ctx)
}

function requireDeployedStageVariables(env: Parsed, ctx: Ctx) {
  if (env.APP_ENV === "dev") return

  requireAll(ctx, env, ["APP_BASE_URL", "CRON_SECRET"], `when APP_ENV is ${env.APP_ENV}`)

  if (env.APP_BASE_URL && !env.APP_BASE_URL.startsWith("https://")) {
    reject(ctx, "APP_BASE_URL", "must be https outside dev; one-time status links travel over it.")
  }
}

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

  const expected = isProduction ? ZULEX_BASE_URLS.production : ZULEX_BASE_URLS.integration

  if (env.ZULEX_BASE_URL !== expected) {
    reject(ctx, "ZULEX_BASE_URL", `must be the Zulex ${isProduction ? "production" : "integration"} host (${expected}) when APP_ENV is ${env.APP_ENV}.`)
  }
}

function checkMail(env: Parsed, ctx: Ctx, isProduction: boolean) {
  if (env.MAIL_DRIVER === "resend") {
    requireAll(ctx, env, ["RESEND_API_KEY", "MAIL_FROM"], "when MAIL_DRIVER is resend")
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

// Provisional: launch plan Q45 (when production may run the fake identity check).
export function fakeIdentityProblem(stage: Stage, servicesOnSale: readonly Service[]): string | undefined {
  const verifying = servicesOnSale.filter(requiresIdentityVerification)
  if (stage !== "production" || verifying.length === 0) return undefined
  return `may not be "fake" in production while ${verifying.join(", ")} is on sale: a fake check proves nobody's identity.`
}

function checkIdentity(env: Parsed, ctx: Ctx) {
  const problem = env.IDENTITY_DRIVER === "fake" ? fakeIdentityProblem(env.APP_ENV, env.SERVICES_ON_SALE) : undefined
  if (problem) reject(ctx, "IDENTITY_DRIVER", problem)
}

const INVITE_CODES = {
  deregistration: "INVITE_CODES_DEREGISTRATION",
  newRegistration: "INVITE_CODES_NEW_REGISTRATION",
} as const satisfies Record<OrderableService, keyof Parsed>

function checkBeta(env: Parsed, ctx: Ctx) {
  for (const service of env.BETA_SERVICES) {
    if (env[INVITE_CODES[service]].length === 0) {
      reject(ctx, INVITE_CODES[service], `required while ${service} is in BETA_SERVICES: nobody could order it.`)
    }
  }

  for (const [service, variable] of Object.entries(INVITE_CODES) as [OrderableService, keyof Parsed][]) {
    const codes = env[variable] as string[]
    if (codes.length > 0 && !env.BETA_SERVICES.includes(service)) {
      reject(ctx, variable, `is set but ${service} is not in BETA_SERVICES, so anyone could order it.`)
    }
    if (codes.some((code) => code.length < MIN_INVITE_LENGTH)) {
      reject(ctx, variable, `holds a code shorter than ${MIN_INVITE_LENGTH} characters, which is too easy to guess.`)
    }
  }
}

export function betaOf(env: Pick<Env, "BETA_SERVICES" | "BETA_DAILY_CAP" | typeof INVITE_CODES[OrderableService]>): Beta | undefined {
  if (env.BETA_SERVICES.length === 0) return undefined
  const invites = Object.fromEntries(env.BETA_SERVICES.map((service) => [service, env[INVITE_CODES[service]]]))
  return { invites, dailyPlaces: env.BETA_DAILY_CAP }
}

export class EnvironmentError extends Error {
  constructor(problems: string[]) {
    super(`Invalid environment:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`)
    this.name = "EnvironmentError"
  }
}

export type EnvSource = Record<string, string | undefined>

const withoutBlanks = (source: EnvSource): EnvSource =>
  Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ""))

const DEV_DEFAULTS = { APP_BASE_URL: "http://localhost:3000" } as const

// Names the variable, never its value: some values are secrets.
const environmentError = (error: z.ZodError) =>
  new EnvironmentError(error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`))

export function parseEnv(source: EnvSource): Env {
  const provided = withoutBlanks(source)
  const candidate = provided.APP_ENV === "dev" ? { ...DEV_DEFAULTS, ...provided } : provided
  const result = schema.safeParse(candidate)

  if (result.success) return result.data
  throw environmentError(result.error)
}

export function parseSales(source: EnvSource): { servicesOnSale: OrderableService[]; betaServices: OrderableService[] } {
  const result = salesSchema.safeParse(withoutBlanks(source))

  if (!result.success) throw environmentError(result.error)
  return { servicesOnSale: result.data.SERVICES_ON_SALE, betaServices: result.data.BETA_SERVICES }
}

export const salesOfDeployment = () => parseSales(process.env)

const keyRotationSchema = z.object({
  DIRECT_DATABASE_URL: z.string().min(1),
  DATABASE_CA_CERT: databaseCaCert,
  CODES_ENCRYPTION_KEY: aesKey,
  RETIRED_CODES_ENCRYPTION_KEYS: retiredKeys,
})

export type KeyRotation = z.output<typeof keyRotationSchema>

// Only what re-encrypting needs, so an operator's shell does not have to hold every secret of the stage.
export function parseKeyRotation(source: EnvSource): KeyRotation {
  const result = keyRotationSchema.safeParse(withoutBlanks(source))

  if (!result.success) throw environmentError(result.error)
  return result.data
}
