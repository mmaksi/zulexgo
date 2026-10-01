import { anApplication } from "@/tests/fixtures/applications"
import { FakeClock } from "@/src/adapters/clock/fake/fake-clock"
import { InMemoryRateLimiter } from "@/src/adapters/rate-limit/fake/in-memory-rate-limiter"
import { InMemoryApplicationRepository } from "@/src/adapters/repository/fake/in-memory-application-repository"
import { InMemoryDocumentStore } from "@/src/adapters/storage/fake/in-memory-document-store"
import { RATE_LIMITS } from "@/src/core/domain/rate-limits"
import { handleDocumentDownload } from "@/app/status/[token]/documents/[documentId]/handle"

const OWN_TOKEN = "faketoken-own-download"
const OTHER_TOKEN = "faketoken-other-download"
const own = anApplication({ status: "completed" })
const other = anApplication({ status: "completed" })
const confirmation = { id: "9007199254740993", kind: "confirmation" } as const
const pdf = new TextEncoder().encode("%PDF-fake-confirmation")

async function setup() {
  const clock = new FakeClock()
  const deps = {
    repository: new InMemoryApplicationRepository([
      { application: own, statusToken: OWN_TOKEN },
      { application: other, statusToken: OTHER_TOKEN },
    ]),
    documents: new InMemoryDocumentStore(),
    rateLimiter: new InMemoryRateLimiter(clock),
  }
  await deps.documents.put(own.reference, confirmation, pdf)
  await deps.documents.put(other.reference, { id: "5", kind: "confirmation" }, pdf)
  return deps
}

const download = (deps: Awaited<ReturnType<typeof setup>>, token: string, documentId: string, address = "203.0.113.7") =>
  handleDocumentDownload(
    deps,
    new Request("https://zulexgo.example.test/status/x/documents/y", { headers: { "x-forwarded-for": address } }),
    { token, documentId },
  )

describe("the document download", () => {
  it("serves the document to the link it belongs to, as a file that is never cached or sniffed", async () => {
    const response = await download(await setup(), OWN_TOKEN, confirmation.id)

    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdf)
    expect(response.headers.get("content-type")).toBe("application/pdf")
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="ZulexGO-${own.reference}-Bestaetigung.pdf"`)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
  })

  it("does not claim to be a PDF when it is not one", async () => {
    const deps = await setup()
    await deps.documents.put(own.reference, { id: "6", kind: "unknown" }, new TextEncoder().encode("<html>"))

    const response = await download(deps, OWN_TOKEN, "6")

    expect(response.headers.get("content-type")).toBe("application/octet-stream")
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="ZulexGO-${own.reference}-Dokument"`)
  })

  it.each([
    ["an unknown link", "faketoken-unknown", confirmation.id],
    ["another order's link asking for this order's document", OTHER_TOKEN, confirmation.id],
    ["a document this order does not have", OWN_TOKEN, "42"],
  ])("answers %s with the same empty 404", async (_, token, documentId) => {
    const response = await download(await setup(), token, documentId)

    expect(response.status).toBe(404)
    expect(await response.text()).toBe("")
    expect(response.headers.get("content-disposition")).toBeNull()
  })

  describe("rate limiting", () => {
    it("refuses an address that keeps asking, with the time to wait, and serves another address meanwhile", async () => {
      const deps = await setup()
      for (let attempt = 0; attempt < RATE_LIMITS.documentDownload.max; attempt += 1) {
        expect((await download(deps, OWN_TOKEN, confirmation.id)).status).toBe(200)
      }

      const refused = await download(deps, OWN_TOKEN, confirmation.id)

      expect(refused.status).toBe(429)
      expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0)
      expect(await refused.text()).toBe("")
      expect((await download(deps, OWN_TOKEN, confirmation.id, "198.51.100.9")).status).toBe(200)
    })

    it("counts guesses at links too, since a wrong link is what an attacker sends", async () => {
      const deps = await setup()
      for (let attempt = 0; attempt < RATE_LIMITS.documentDownload.max; attempt += 1) await download(deps, "faketoken-guess", confirmation.id)

      expect((await download(deps, OWN_TOKEN, confirmation.id)).status).toBe(429)
    })
  })
})
