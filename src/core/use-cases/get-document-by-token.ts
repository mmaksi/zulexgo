import type { ApplicationReference } from "@/src/core/domain/application-reference"
import type { DocumentKind } from "@/src/core/domain/document"
import { TokenInvalid } from "@/src/core/errors/token-invalid"
import type { ApplicationRepository } from "@/src/core/ports/application-repository"
import type { DocumentStore } from "@/src/core/ports/document-store"

export interface DownloadableDocument {
  readonly reference: ApplicationReference
  readonly kind: DocumentKind
  readonly bytes: Uint8Array
}

/**
 * A document of the application behind a status link. A link nobody holds,
 * another order's document and a document that does not exist all fail the
 * same way, so a guess learns nothing.
 */
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
