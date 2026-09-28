import type { z } from "zod"
import { GatewayRejected } from "@/src/core/errors/gateway-rejected"
import { GatewayUnavailable } from "@/src/core/errors/gateway-unavailable"

const TIMEOUT_MS = 15_000

/** 409 is "GET the latest version and retry", 429 and 5xx are "back off": all worth another try later. */
const isTransient = (status: number) => status === 409 || status === 429 || status >= 500

/**
 * Thrown for what no retry fixes: a wrong API key, an unknown id. Carries the
 * status and path only; never a request body, which holds security codes.
 */
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

/** One call to the Zulex API, with vendor failures turned into domain errors at this edge. */
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

/** Parses JSON keeping every `id` as its source text: document ids are int64, beyond what a JS number holds exactly. */
export async function readJson<Schema extends z.ZodType>(response: Response, schema: Schema): Promise<z.output<Schema>> {
  const text = await response.text()
  const reviver = (key: string, value: unknown, context?: { source?: string }) =>
    key === "id" && typeof value === "number" && context?.source ? context.source : value
  return schema.parse(JSON.parse(text, reviver as Parameters<typeof JSON.parse>[1]))
}

/** Retry-After is either delay-seconds or an HTTP date. */
function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(header)
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}
