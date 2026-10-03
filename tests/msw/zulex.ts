import { http, HttpResponse } from "msw"
import {
  deregistrationResponseJson,
  ZULEX_BASE_URL,
  type CreateDeregistrationBody,
  type ZulexDocument,
  type ZulexErrorInfo,
  type ZulexStatus,
} from "@/tests/fixtures/zulex"

export const ZULEX_TEST_API_KEY = "fake-zulex-api-key"

type Operation = "create" | "get" | "patch" | "retry" | "authorities" | "document"

interface Stored {
  body: CreateDeregistrationBody
  status: ZulexStatus | string
  documents: ZulexDocument[]
  errorInfo?: ZulexErrorInfo
}

/**
 * A stand-in for the Zulex integration environment at the network boundary,
 * following docs/api-1.yaml: API key required, idempotent create, the three
 * status values, bare-binary documents. Tests script its state and its next
 * failure; `requests` records what the adapter sent.
 */
export class ZulexDouble {
  readonly requests: { method: string; path: string; headers: Headers; body?: unknown }[] = []
  readonly applications = new Map<string, Stored>()
  private readonly idempotency = new Map<string, string>()
  private readonly authorities = new Map<string, { kreiscode: string; ikfzStatus: string }[]>()
  private readonly documents = new Map<string, Uint8Array>()
  private readonly failures = new Map<Operation, Response>()
  private sequence = 0

  /** `where` is a plate prefix or a postcode: whichever the adapter asks by, the double answers by it. */
  setAuthorities(where: string, authorities: { kreiscode: string; ikfzStatus: string }[]) {
    this.authorities.set(where, authorities)
  }

  setStatus(applicationId: string, status: ZulexStatus | string, extra: { documents?: ZulexDocument[]; errorInfo?: ZulexErrorInfo } = {}) {
    Object.assign(this.stored(applicationId), { status, documents: extra.documents ?? [], errorInfo: extra.errorInfo })
  }

  setDocument(documentId: string, bytes: Uint8Array) {
    this.documents.set(documentId, bytes)
  }

  /** The next call of `operation` answers with this response instead. */
  failNext(operation: Operation, response: Response) {
    this.failures.set(operation, response)
  }

  readonly handlers = [
    http.get(`${ZULEX_BASE_URL}/registration-authorities`, ({ request }) =>
      this.guard("authorities", request, async () => {
        const query = new URL(request.url).searchParams
        const where = query.get("licencePlatePrefix") ?? query.get("postcode") ?? ""
        const registrationAuthorities = this.authorities.get(where) ?? [{ kreiscode: "00000", ikfzStatus: "online" }]
        return HttpResponse.json({ registrationAuthorities })
      }),
    ),

    http.post(`${ZULEX_BASE_URL}/deregistration-applications`, ({ request }) =>
      this.guard("create", request, async (body) => {
        const key = request.headers.get("X-Idempotency-Key")
        const earlier = key ? this.idempotency.get(key) : undefined
        if (earlier) return HttpResponse.json({ applicationId: earlier }, { status: 201 })

        this.sequence += 1
        const applicationId = `00000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`
        this.applications.set(applicationId, { body: body as CreateDeregistrationBody, status: "IN_PROGRESS", documents: [] })
        if (key) this.idempotency.set(key, applicationId)
        return HttpResponse.json({ applicationId }, { status: 201 })
      }),
    ),

    http.get(`${ZULEX_BASE_URL}/deregistration-applications/:id`, ({ request, params }) =>
      this.guard("get", request, async () => {
        const stored = this.applications.get(String(params.id))
        if (!stored) return new HttpResponse(null, { status: 404 })
        return new HttpResponse(deregistrationResponseJson({ applicationId: String(params.id), ...stored }), {
          headers: { "Content-Type": "application/json" },
        })
      }),
    ),

    http.patch(`${ZULEX_BASE_URL}/deregistration-applications/:id`, ({ request, params }) =>
      this.guard("patch", request, async (body) => {
        const stored = this.applications.get(String(params.id))
        if (!stored) return new HttpResponse(null, { status: 404 })
        Object.assign(stored, { body: { ...stored.body, ...(body as object) }, status: "IN_PROGRESS", errorInfo: undefined })
        return new HttpResponse(deregistrationResponseJson({ applicationId: String(params.id), ...stored }))
      }),
    ),

    http.post(`${ZULEX_BASE_URL}/applications/:id/retry`, ({ request, params }) =>
      this.guard("retry", request, async () => {
        const stored = this.applications.get(String(params.id))
        if (!stored) return new HttpResponse(null, { status: 404 })
        Object.assign(stored, { status: "IN_PROGRESS", errorInfo: undefined })
        return new HttpResponse(null, { status: 204 })
      }),
    ),

    http.get(`${ZULEX_BASE_URL}/documents/:id`, ({ request, params }) =>
      this.guard("document", request, async () => {
        const bytes = this.documents.get(String(params.id))
        if (!bytes) return new HttpResponse(null, { status: 404 })
        return new HttpResponse(bytes, { headers: { "Content-Type": "application/octet-stream" } })
      }),
    ),
  ]

  private async guard(operation: Operation, request: Request, respond: (body: unknown) => Promise<Response>) {
    const body = request.method === "GET" ? undefined : await request.text().then((text) => (text ? JSON.parse(text) : undefined))
    this.requests.push({ method: request.method, path: new URL(request.url).pathname, headers: request.headers, body })

    if (request.headers.get("X-Api-Key") !== ZULEX_TEST_API_KEY) return new HttpResponse(null, { status: 401 })
    const failure = this.failures.get(operation)
    if (failure) {
      this.failures.delete(operation)
      return failure
    }
    return respond(body)
  }

  private stored(applicationId: string): Stored {
    const stored = this.applications.get(applicationId)
    if (!stored) throw new Error(`ZulexDouble: unknown application ${applicationId}`)
    return stored
  }
}
