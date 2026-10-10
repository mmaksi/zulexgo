import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import type { DocumentKind } from "@/src/core/domain/registration/document"
import { TokenInvalid } from "@/src/core/errors/application/token-invalid"
import type { ApplicationRepository } from "@/src/core/ports/repository/application-repository"
import type { DocumentStore } from "@/src/core/ports/storage/document-store"

export interface DownloadableDocument {
  readonly reference: ApplicationReference
  readonly kind: DocumentKind
  readonly bytes: Uint8Array
}

// Every miss fails alike, so a guess learns nothing; the caller rate-limits by address first.
export async function getDocumentByToken(
  deps: { repository: Pick<ApplicationRepository, "findByStatusToken">; documents: Pick<DocumentStore, "get"> },
  token: string,
  documentId: string,
): Promise<DownloadableDocument> {
  const application = token ? await deps.repository.findByStatusToken(token) : undefined
  const document = application && (await deps.documents.get(application.reference, documentId))
  if (!application || !document) throw new TokenInvalid()

  return { reference: application.reference, ...document }
}
