import type { z } from "zod"
import { GatewayRejected } from "@/src/core/errors/registration/gateway-rejected"
import { GatewayUnavailable } from "@/src/core/errors/registration/gateway-unavailable"

// An abort proves nothing: the submission may still have been filed, hence its idempotency key.
const TIMEOUT_MS = 15_000

// Zulex's 409 is a concurrent modification ("GET the latest and retry"), so it is transient.
const isTransient = (status: number) => status === 409 || status === 429 || status >= 500

// Status and path only, never a body: request bodies carry security codes.
export class ZulexRequestFailed extends Error {
  constructor(method: string, path: string, status: number) {
    super(`Zulex ${method} ${path} answered ${status}`)
    this.name = "ZulexRequestFailed"
  }
}

export interface ZulexConfig {
  readonly baseUrl: string
  readonly apiKey: string
}

export async function zulexRequest(
  config: ZulexConfig,
  method: string,
  path: string,
  options: { body?: unknown; idempotencyKey?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = { "X-Api-Key": config.apiKey, Accept: "application/json" }
  if (options.body !== undefined) headers["Content-Type"] = "application/json"
  if (options.idempotencyKey) headers["X-Idempotency-Key"] = options.idempotencyKey

  let response: Response
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // A status read must never be answered from Next's fetch cache.
      cache: "no-store",
    })
  } catch {
    throw new GatewayUnavailable()
  }

  if (response.ok) return response
  if (response.status === 400) throw new GatewayRejected()
  if (isTransient(response.status)) throw new GatewayUnavailable(retryAfterMs(response.headers.get("Retry-After")))
  throw new ZulexRequestFailed(method, path.split("?")[0], response.status)
}

// Keeps each int64 `id` as its source text (reviver context, Node 21+): a JS number loses precision.
export async function readJson<Schema extends z.ZodType>(response: Response, schema: Schema): Promise<z.output<Schema>> {
  const text = await response.text()
  const reviver = (key: string, value: unknown, context?: { source?: string }) =>
    key === "id" && typeof value === "number" && context?.source ? context.source : value
  let parsed: unknown
  try {
    parsed = JSON.parse(text, reviver as Parameters<typeof JSON.parse>[1])
  } catch {
    // Never rethrow the SyntaxError: it quotes the body, which echoes what was filed.
    throw new Error("Zulex answered with a body that is not JSON")
  }
  return schema.parse(parsed)
}

function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(header)
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}
