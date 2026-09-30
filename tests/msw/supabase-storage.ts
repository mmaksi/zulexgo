import { http, HttpResponse } from "msw"

export const STORAGE_TEST_URL = "https://storage-project.example.test"
export const STORAGE_TEST_BUCKET = "documents"
export const STORAGE_TEST_KEY = "sb_secret_fake_zulexgo"

type Call = "list" | "upload" | "download" | "remove"

interface StoredObject {
  bytes: Uint8Array
  contentType: string | null
  createdAt: number
}

const BASE = `${STORAGE_TEST_URL}/storage/v1`

const unauthorized = () =>
  HttpResponse.json({ statusCode: "403", error: "Unauthorized", message: "Invalid Compact JWS" }, { status: 403 })

const notFound = () =>
  HttpResponse.json({ statusCode: "404", error: "not_found", message: "Object not found" }, { status: 400 })

/**
 * Supabase Storage's object endpoints at the network boundary, as the
 * @supabase/storage-js client calls them: upload (`POST /object/{bucket}/{path}`,
 * with `x-upsert`), download (`GET`) and list (`POST /object/list/{bucket}`).
 * Like Storage, a private bucket answers only requests that carry the key.
 */
export class SupabaseStorageDouble {
  readonly objects = new Map<string, StoredObject>()
  private failure?: { response: Response; on?: Call }
  private clock = 0

  /** The next request, or the next `on` one, gets this response instead. */
  failNext(response: Response, on?: Call) {
    this.failure = { response, on }
  }

  private hijacked(call: Call) {
    if (!this.failure || (this.failure.on && this.failure.on !== call)) return undefined
    const { response } = this.failure
    this.failure = undefined
    return response
  }

  private allowed(request: Request, bucket: string) {
    const key = request.headers.get("apikey")
    return key === STORAGE_TEST_KEY && bucket === STORAGE_TEST_BUCKET
  }

  readonly handlers = [
    http.post(`${BASE}/object/list/:bucket`, async ({ request, params }) => {
      const failure = this.hijacked("list")
      if (failure) return failure
      if (!this.allowed(request, String(params.bucket))) return unauthorized()

      const { prefix = "", sortBy } = (await request.json()) as { prefix?: string; sortBy?: { column: string; order: string } }
      const folder = prefix ? `${prefix.replace(/\/$/, "")}/` : ""
      const entries = [...this.objects]
        .filter(([path]) => path.startsWith(folder) && !path.slice(folder.length).includes("/"))
        .map(([path, object]) => ({ name: path.slice(folder.length), id: `id-${object.createdAt}`, created_at: object.createdAt }))
      const byCreated = sortBy?.column === "created_at"
      entries.sort((a, b) => (byCreated ? a.created_at - b.created_at : a.name.localeCompare(b.name)) * (sortBy?.order === "desc" ? -1 : 1))
      return HttpResponse.json(entries.map(({ name, id }) => ({ name, id, metadata: { size: 0 } })))
    }),

    http.post(`${BASE}/object/:bucket/*`, async ({ request, params }) => {
      const failure = this.hijacked("upload")
      if (failure) return failure
      if (!this.allowed(request, String(params.bucket))) return unauthorized()

      const path = [params[0]].flat().join("/")
      const earlier = this.objects.get(path)
      if (earlier && request.headers.get("x-upsert") !== "true") {
        return HttpResponse.json({ statusCode: "409", error: "Duplicate", message: "The resource already exists" }, { status: 400 })
      }
      const bytes = new Uint8Array(await request.arrayBuffer())
      this.objects.set(path, {
        bytes,
        contentType: request.headers.get("content-type"),
        createdAt: earlier?.createdAt ?? ++this.clock,
      })
      return HttpResponse.json({ Id: `id-${this.clock}`, Key: `${params.bucket}/${path}` })
    }),

    http.delete(`${BASE}/object/:bucket`, async ({ request, params }) => {
      const failure = this.hijacked("remove")
      if (failure) return failure
      if (!this.allowed(request, String(params.bucket))) return unauthorized()

      const { prefixes } = (await request.json()) as { prefixes: string[] }
      const removed = prefixes.filter((path) => this.objects.delete(path))
      return HttpResponse.json(removed.map((name) => ({ name, bucket_id: STORAGE_TEST_BUCKET })))
    }),

    http.get(`${BASE}/object/:bucket/*`, ({ request, params }) => {
      const failure = this.hijacked("download")
      if (failure) return failure
      if (!this.allowed(request, String(params.bucket))) return unauthorized()

      const object = this.objects.get([params[0]].flat().join("/"))
      if (!object) return notFound()
      return new HttpResponse(object.bytes.slice(), { headers: { "content-type": object.contentType ?? "application/octet-stream" } })
    }),
  ]
}
