import type { Stage } from "@/src/config/env"
import { DuplicateApplication } from "@/src/core/errors/application/duplicate-application"
import type { ApplicationRepository } from "@/src/core/ports/repository/application-repository"
import type { DocumentStore } from "@/src/core/ports/storage/document-store"
import { SEEDED_APPLICATIONS, type SeededApplication } from "./data/applications"
import { SEEDED_DOCUMENTS, type SeededDocument } from "./data/documents"
import { SEEDED_PAYMENTS, type SeededPayment } from "./data/payments"

export function seedFor(stage: Stage): readonly SeededApplication[] {
  if (stage === "production") throw new Error("The seed never loads in production.")
  return SEEDED_APPLICATIONS
}

export function seedDocumentsFor(stage: Stage): readonly SeededDocument[] {
  if (stage === "production") throw new Error("The seed never loads in production.")
  return SEEDED_DOCUMENTS
}

export function seedPaymentsFor(stage: Stage): readonly SeededPayment[] {
  if (stage === "production") throw new Error("The seed never loads in production.")
  return SEEDED_PAYMENTS
}

export async function loadDocuments(store: DocumentStore, seed: readonly SeededDocument[]): Promise<number> {
  let added = 0
  for (const { reference, document, bytes } of seed) {
    if (await store.get(reference, document.id)) continue
    await store.put(reference, document, bytes)
    added += 1
  }
  return added
}

export async function loadSeed(repository: ApplicationRepository, seed: readonly SeededApplication[]): Promise<number> {
  let added = 0
  for (const { application, statusToken } of seed) {
    try {
      await repository.create(application)
      added += 1
    } catch (error) {
      if (!(error instanceof DuplicateApplication && error.field === "reference")) throw error
    }
    await repository.setStatusToken(application.reference, statusToken)
  }
  return added
}
