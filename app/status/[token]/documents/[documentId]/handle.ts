import type { DocumentKind } from "@/src/core/domain/registration/document"
import { RATE_LIMITS } from "@/src/core/domain/rate-limit/rate-limits"
import { TokenInvalid } from "@/src/core/errors/application/token-invalid"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { getDocumentByToken } from "@/src/core/use-cases/status/get-document-by-token"
import { clientAddress } from "@/src/lib/client-address"

// ASCII only: a filename in a header is no place for umlauts
const FILE_LABELS: Record<DocumentKind, string> = {
  confirmation: "Bestaetigung",
  temporaryCertificate: "Zulassungsnachweis",
  rejection: "Ablehnung",
  fee: "Gebuehren",
  unknown: "Dokument",
}

const isPdf = (bytes: Uint8Array) => new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-"

export async function handleDocumentDownload(
  deps: Pick<Dependencies, "repository" | "documents" | "rateLimiter">,
  request: Request,
  { token, documentId }: { token: string; documentId: string },
): Promise<Response> {
  const attempt = await deps.rateLimiter.consume(`document-download:${clientAddress(request.headers)}`, RATE_LIMITS.documentDownload)
  if (!attempt.allowed) {
    return new Response(null, { status: 429, headers: { "retry-after": String(Math.ceil(attempt.retryAfterMs / 1000)) } })
  }

  try {
    const { reference, kind, bytes } = await getDocumentByToken(deps, token, documentId)
    const pdf = isPdf(bytes)
    return new Response(bytes.slice(), {
      headers: {
        "content-type": pdf ? "application/pdf" : "application/octet-stream",
        "content-disposition": `attachment; filename="ZulexGO-${reference}-${FILE_LABELS[kind]}${pdf ? ".pdf" : ""}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    })
  } catch (error) {
    if (error instanceof TokenInvalid) return new Response(null, { status: 404 })
    throw error
  }
}
