import type { z } from "zod"
import { GatewayRejected } from "@/src/core/errors/gateway-rejected"
import { GatewayUnavailable } from "@/src/core/errors/gateway-unavailable"

/**
 * A request that outlives this is aborted and reported as `GatewayUnavailable`. The abort proves
 * nothing about the server: a submission may still have been filed, which is why submissions
 * carry an idempotency key.
 */
const TIMEOUT_MS = 15_000

/** 409 is "GET the latest version and retry", 429 and 5xx are "back off": all worth another try later. */
const isTransient = (status: number) => status === 409 || status === 429 || status >= 500

/**
 * Thrown for what no retry fixes: a wrong API key, an unknown id. Carries the
 * status and path only; never a request body, which holds security codes.
 *
 * Deliberately not a domain error: it means our configuration or request is wrong (401 for a
 * wrong key, 404 for an unknown id, or a status the spec does not describe), and should be loud
 * in the logs. The message carries the path without its query string. On submission the use case
 * still treats it as an unconfirmed attempt, since the service may hold the application anyway.
 */
export class ZulexRequestFailed extends Error {
  constructor(method: string, path: string, status: number) {
    super(`Zulex ${method} ${path} answered ${status}`)
    this.name = "ZulexRequestFailed"
  }
}

export interface ZulexConfig {
  /**
   * The host including its version prefix, with no trailing slash: paths are appended as they are.
   * `src/config/env.ts` pins it to the integration or the production host by stage.
   */
  readonly baseUrl: string
  /** The merchant's `X-Api-Key`. Sent as a header only, never logged, never reaches the browser. */
  readonly apiKey: string
}

/**
 * One call to the Zulex API, with vendor failures turned into domain errors at this edge.
 *
 * The status is sorted by what the caller may do next, following the spec's own guidance:
 * - 2xx returns the response, still unread.
 * - 400 is `GatewayRejected`: invalid input, "fix the data and resubmit", so the same data fails again.
 * - 409, 429 and 5xx (504 in the spec) are `GatewayUnavailable`, carrying `Retry-After` when sent.
 *   A 409 means a concurrent modification and the spec says to GET the latest version first;
 *   this function does not, it leaves the retry to the caller.
 * - A network failure or timeout is `GatewayUnavailable` too, with no `Retry-After`.
 * - Anything else (401, 403, 404...) is `ZulexRequestFailed`, not a domain error.
 *
 * `idempotencyKey` becomes `X-Idempotency-Key`, which the spec defines on creating calls only.
 */
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

/**
 * Parses JSON keeping every `id` as its source text: document ids are int64, beyond what a JS number holds exactly.
 *
 * Relies on `JSON.parse` handing the reviver the number's source text (Node 21 and later). Where
 * that is missing the id stays a number and the schemas, which expect a string, reject it.
 * A body that does not match `schema` throws a `ZodError`, which is not a domain error.
 */
export async function readJson<Schema extends z.ZodType>(response: Response, schema: Schema): Promise<z.output<Schema>> {
  const text = await response.text()
  const reviver = (key: string, value: unknown, context?: { source?: string }) =>
    key === "id" && typeof value === "number" && context?.source ? context.source : value
  return schema.parse(JSON.parse(text, reviver as Parameters<typeof JSON.parse>[1]))
}

/** Retry-After is either delay-seconds or an HTTP date. A past date clamps to zero; junk is ignored. */
function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(header)
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}
