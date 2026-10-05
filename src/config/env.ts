import "server-only"
import { z } from "zod"
import { requiresIdentityVerification } from "@/src/core/domain/application/application-status"
import { type Beta, MIN_INVITE_LENGTH, normaliseInvite } from "@/src/core/domain/application/beta"
import { isOrderable, type OrderableService, type Service } from "@/src/core/domain/application/service"

/**
 * The single place this application interprets `process.env`; the container
 * only hands it over.
 */

/**
 * The deployment stages. `APP_ENV` is the only switch for adapters, base URLs
 * and guardrails. `NODE_ENV` is not: `next build` sets it to "production" for
 * the staging deploy too.
 */
export const STAGES = ["dev", "staging", "production"] as const
export type Stage = (typeof STAGES)[number]

/**
 * Zulex has exactly two API hosts. Dev and staging share the integration host;
 * production uses the live one. `ZULEX_BASE_URL` must equal the stage's host,
 * so a staging deploy cannot file real applications.
 */
export const ZULEX_BASE_URLS = {
  integration: "https://integration-zulex.de/zulex-api/v1",
  production: "https://app.zulex.de/zulex-api/v1",
} as const

/** AES-256-GCM takes a 32-byte key; `CODES_ENCRYPTION_KEY` is that key in base64. */
const CODES_KEY_BYTES = 32

/** Never defaulted: an unset secret stays unset, and the guardrails require it where it is used. */
const secret = z.string().min(1).optional()

/** A comma-separated list in the environment, an array of trimmed entries here. */
const commaList = (list: string) => list.split(",").map((entry) => entry.trim()).filter(Boolean)

const inviteCodes = (list: string) => commaList(list).map(normaliseInvite)

const orderableService = z.custom<OrderableService>(isOrderable, { message: "is not a service an order can be made for." })

/**
 * What the deployment sells. These are read by pages built ahead of any request as well as by the
 * container, so they are a schema of their own (`parseSales`).
 */
const salesFields = {
  // The services checkout takes an order for. De-registration alone until a stage says otherwise, so
  // a deploy that sets nothing sells what it always sold; the card on the landing page and the funnel's
  // route follow this list, and `submitCheckout` refuses anything else.
  SERVICES_ON_SALE: z.string().default("deregistration").transform(commaList).pipe(z.array(orderableService).min(1)),
  // The services on sale to people with an invite code only. One not listed here is open to everyone.
  BETA_SERVICES: z.string().default("").transform(commaList).pipe(z.array(orderableService)),
  // Checkouts a day for each service in beta.
  BETA_DAILY_CAP: z.coerce.number().int().min(1).default(5),
  // The invite codes of each service, one per person in the beta. Secrets: never in an error or a log.
  INVITE_CODES_DEREGISTRATION: z.string().default("").transform(inviteCodes),
  INVITE_CODES_NEW_REGISTRATION: z.string().default("").transform(inviteCodes),
}
const salesSchema = z.object(salesFields)

/**
 * Every variable the application reads. Most are optional in the type and
 * required by the guardrails only when the feature that uses them is switched
 * on, so dev boots on fakes with no secrets at all. `.env.example` documents
 * each one for operators.
 */
const schema = z
  .object({
    APP_ENV: z.enum(STAGES),

    ...salesFields,

    // Public origin the status links are built on; defaulted in dev, https-only elsewhere.
    APP_BASE_URL: z.url().optional(),
    // Bearer token a scheduler presents to /api/internal/poll; unset, the route refuses everyone.
    CRON_SECRET: secret,

    // One driver per port. The defaults are the fake (or console) adapters, so dev needs nothing;
    // production rejects them all, and a real driver makes its credentials required.
    PAYMENT_DRIVER: z.enum(["fake", "stripe"]).default("fake"),
    REGISTRATION_DRIVER: z.enum(["fake", "zulex"]).default("fake"),
    MAIL_DRIVER: z.enum(["console", "resend"]).default("console"),
    REPOSITORY_DRIVER: z.enum(["fake", "postgres"]).default("fake"),
    STORAGE_DRIVER: z.enum(["fake", "supabase"]).default("fake"),
    // The Verimi adapter is not built yet (launch plan Q1–Q3), so the fake is the only value.
    IDENTITY_DRIVER: z.enum(["fake"]).default("fake"),

    STRIPE_SECRET_KEY: secret,
    STRIPE_WEBHOOK_SECRET: secret,
    // The only value here that reaches the browser (the funnel hands it to Stripe's payment form).
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),

    ZULEX_BASE_URL: z.url().optional(),
    // Merchant credential sent as X-Api-Key: server-side only, never exposed to the browser.
    ZULEX_API_KEY: secret,

    RESEND_API_KEY: secret,
    MAIL_FROM: z.string().min(1).optional(),
    // A comma-separated list in the environment, an array of trimmed addresses here.
    MAIL_ALLOWLIST: z.string().default("").transform(commaList),

    // The app connects through the transaction pooler (DATABASE_URL); the db commands
    // (migrate, seed) use the session connection (DIRECT_DATABASE_URL).
    DATABASE_URL: secret,
    DIRECT_DATABASE_URL: secret,
    // Encrypts security codes and status tokens at rest; also keys the rate limiter's hashes.
    CODES_ENCRYPTION_KEY: secret,

    SUPABASE_STORAGE_URL: z.url().optional(),
    SUPABASE_STORAGE_BUCKET: z.string().min(1).optional(),
    SUPABASE_STORAGE_SERVICE_KEY: secret,
  })
  .superRefine(applyGuardrails)

/**
 * The validated environment, with defaults applied and `MAIL_ALLOWLIST` split
 * into an array. A variable that a driver requires is still typed optional;
 * `applyGuardrails` guarantees it is present, which is why the container
 * asserts those with `!`.
 */
export type Env = z.infer<typeof schema>

type Ctx = z.core.$RefinementCtx
type Parsed = z.core.output<typeof schema>

/** Reports a problem against one variable, so the error names it. */
const reject = (ctx: Ctx, variable: keyof Parsed, message: string) =>
  ctx.addIssue({ code: "custom", path: [variable], message })

/** Flags every missing variable, not just the first, so one failed boot lists everything to set. */
const requireAll = (ctx: Ctx, env: Parsed, variables: (keyof Parsed)[], because: string) => {
  for (const variable of variables) {
    if (!env[variable]) reject(ctx, variable, `required ${because}.`)
  }
}

/**
 * The cross-field rules zod cannot express per variable: what each stage and
 * each driver requires, and which combinations are unsafe. They are code, not
 * policy, so a bad deploy fails at startup instead of mid-checkout.
 */
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

/** The Stripe driver needs all three keys, and a key's mode has to match the stage. */
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

/**
 * The Zulex driver needs its host and key. The host is checked whenever it is
 * set, even under the fake driver, so a wrong one is caught before the driver
 * is ever switched on.
 */
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

/**
 * Postgres needs both connection strings and the key. The key's size is
 * checked whenever one is set, so a truncated copy fails at boot and not on the
 * first encrypted write.
 */
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

/**
 * Launch plan Q45, provisional: the KBA registers a car in the name the order gives, so production may run the
 * fake identity check only while every service on sale goes straight to the KBA. De-registration can launch
 * without Verimi; a service that verifies the customer cannot go on sale on a fake, which proves nobody's identity.
 * Takes the services on sale so a test can ask about one that is not on sale yet. Returns the problem, if any.
 */
export function fakeIdentityProblem(stage: Stage, servicesOnSale: readonly Service[]): string | undefined {
  const verifying = servicesOnSale.filter(requiresIdentityVerification)
  if (stage !== "production" || verifying.length === 0) return undefined
  return `may not be "fake" in production while ${verifying.join(", ")} is on sale: a fake check proves nobody's identity.`
}

function checkIdentity(env: Parsed, ctx: Ctx) {
  const problem = env.IDENTITY_DRIVER === "fake" ? fakeIdentityProblem(env.APP_ENV, env.SERVICES_ON_SALE) : undefined
  if (problem) reject(ctx, "IDENTITY_DRIVER", problem)
}

/** Where each service's invite codes are set. */
const INVITE_CODES = {
  deregistration: "INVITE_CODES_DEREGISTRATION",
  newRegistration: "INVITE_CODES_NEW_REGISTRATION",
} as const satisfies Record<OrderableService, keyof Parsed>

/**
 * A service in beta needs codes (or nobody could order it), and codes need a service in beta: a list set
 * for a service that is not listed would leave it open to everyone while the operator believes it is
 * invite-only. The messages name variables, never a code.
 */
function checkBeta(env: Parsed, ctx: Ctx) {
  for (const service of env.BETA_SERVICES) {
    if (!env.SERVICES_ON_SALE.includes(service)) reject(ctx, "BETA_SERVICES", `lists ${service}, which is not in SERVICES_ON_SALE.`)
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

/** The beta the deployment runs, if any service is in it: what checkout and the funnels read. */
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

/** Blank is how a deployment platform spells "unset"; zod should see it that way too. */
const withoutBlanks = (source: EnvSource): EnvSource =>
  Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ""))

const DEV_DEFAULTS = { APP_BASE_URL: "http://localhost:3000" } as const

/** Every problem is reported against its variable; the value itself never appears. */
const environmentError = (error: z.ZodError) =>
  new EnvironmentError(error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`))

export function parseEnv(source: EnvSource): Env {
  const provided = withoutBlanks(source)
  const candidate = provided.APP_ENV === "dev" ? { ...DEV_DEFAULTS, ...provided } : provided
  const result = schema.safeParse(candidate)

  if (result.success) return result.data
  throw environmentError(result.error)
}

/**
 * What the deployment sells, without the rest of the environment: for a page that is built before any
 * request (the landing page's cards), where building the container would open adapters for nothing. It
 * is the same setting `parseEnv` validates, so the two cannot disagree.
 */
export function parseSales(source: EnvSource): { servicesOnSale: OrderableService[]; betaServices: OrderableService[] } {
  const result = salesSchema.safeParse(withoutBlanks(source))

  if (!result.success) throw environmentError(result.error)
  return { servicesOnSale: result.data.SERVICES_ON_SALE, betaServices: result.data.BETA_SERVICES }
}

/** What this deployment sells, read from the process's environment. */
export const salesOfDeployment = () => parseSales(process.env)
