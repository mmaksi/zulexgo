import { http, HttpResponse } from "msw"
import {
  applicationResponseJson,
  createRegistrationApplicationSpec,
  deregistrationResponseJson,
  patchRegistrationApplicationSpec,
  ZULEX_BASE_URL,
  type CreateDeregistrationBody,
  type ZulexDocument,
  type ZulexErrorInfo,
  type ZulexStatus,
} from "@/tests/fixtures/zulex"

export const ZULEX_TEST_API_KEY = "fake-zulex-api-key"

type Operation = "create" | "get" | "patch" | "retry" | "authorities" | "document"

interface Stored {
  path: string
  body: object
  status: ZulexStatus | string
  documents: ZulexDocument[]
  errorInfo?: ZulexErrorInfo
}

interface Routes {
  path: string
  accepts: (body: unknown) => boolean
  acceptsPatch: (body: unknown) => boolean
  patched: (filed: object, patch: object) => object
  json: (applicationId: string, stored: Stored) => string
}

const DEREGISTRATION: Routes = {
  path: "/deregistration-applications",
  accepts: () => true,
  acceptsPatch: () => true,
  patched: (filed, patch) => ({ ...filed, ...patch }),
  json: (applicationId, { body, status, documents, errorInfo }) =>
    deregistrationResponseJson({ applicationId, body: body as CreateDeregistrationBody, status, documents, errorInfo }),
}

const NEW_REGISTRATION: Routes = {
  path: "/registration-applications",
  accepts: (body) => createRegistrationApplicationSpec.safeParse(body).success,
  acceptsPatch: (body) => patchRegistrationApplicationSpec.safeParse(body).success,
  patched: (filed, patch) => {
    const { evbNumber, registrationCertificatePart2Number, registrationCertificatePart2SecurityCode } = patch as Record<string, string | undefined>
    return {
      ...filed,
      ...(evbNumber ? { evbNumber } : {}),
      registrationCertificateInfo: {
        ...(filed as { registrationCertificateInfo: object }).registrationCertificateInfo,
        ...(registrationCertificatePart2Number ? { registrationCertificatePart2Number } : {}),
        ...(registrationCertificatePart2SecurityCode ? { registrationCertificatePart2SecurityCode } : {}),
      },
    }
  },
  json: (applicationId, { body, status, documents, errorInfo }) => applicationResponseJson({ applicationId, echoed: body, status, documents, errorInfo }),
}

export class ZulexDouble {
  readonly requests: { method: string; path: string; headers: Headers; body?: unknown }[] = []
  readonly applications = new Map<string, Stored>()
  private readonly idempotency = new Map<string, string>()
  private readonly authorities = new Map<string, { kreiscode: string; ikfzStatus: string }[]>()
  private readonly documents = new Map<string, Uint8Array>()
  private readonly failures = new Map<Operation, Response>()
  private sequence = 0

  setAuthorities(where: string, authorities: { kreiscode: string; ikfzStatus: string }[]) {
    this.authorities.set(where, authorities)
  }

  setStatus(applicationId: string, status: ZulexStatus | string, extra: { documents?: ZulexDocument[]; errorInfo?: ZulexErrorInfo } = {}) {
    Object.assign(this.stored(applicationId), { status, documents: extra.documents ?? [], errorInfo: extra.errorInfo })
  }

  setDocument(documentId: string, bytes: Uint8Array) {
    this.documents.set(documentId, bytes)
  }

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

    ...this.applicationHandlers(DEREGISTRATION),
    ...this.applicationHandlers(NEW_REGISTRATION),

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

  private applicationHandlers({ path, accepts, acceptsPatch, patched, json }: Routes) {
    return [
      http.post(`${ZULEX_BASE_URL}${path}`, ({ request }) =>
        this.guard("create", request, async (body) => {
          if (!accepts(body)) return new HttpResponse(null, { status: 400 })
          const key = request.headers.get("X-Idempotency-Key")
          const earlier = key ? this.idempotency.get(key) : undefined
          if (earlier) return HttpResponse.json({ applicationId: earlier }, { status: 201 })

          this.sequence += 1
          const applicationId = `00000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`
          this.applications.set(applicationId, { path, body: body as object, status: "IN_PROGRESS", documents: [] })
          if (key) this.idempotency.set(key, applicationId)
          return HttpResponse.json({ applicationId }, { status: 201 })
        }),
      ),

      http.get(`${ZULEX_BASE_URL}${path}/:id`, ({ request, params }) =>
        this.guard("get", request, async () => {
          const stored = this.applications.get(String(params.id))
          if (stored?.path !== path) return new HttpResponse(null, { status: 404 })
          return new HttpResponse(json(String(params.id), stored), { headers: { "Content-Type": "application/json" } })
        }),
      ),

      http.patch(`${ZULEX_BASE_URL}${path}/:id`, ({ request, params }) =>
        this.guard("patch", request, async (body) => {
          const stored = this.applications.get(String(params.id))
          if (stored?.path !== path) return new HttpResponse(null, { status: 404 })
          if (!acceptsPatch(body)) return new HttpResponse(null, { status: 400 })
          Object.assign(stored, { body: patched(stored.body, body as object), status: "IN_PROGRESS", errorInfo: undefined })
          return new HttpResponse(json(String(params.id), stored))
        }),
      ),
    ]
  }

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
