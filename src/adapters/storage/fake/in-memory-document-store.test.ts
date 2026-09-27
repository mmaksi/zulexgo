import { documentStoreContract } from "@/src/core/ports/document-store.contract"
import { InMemoryDocumentStore } from "./in-memory-document-store"

documentStoreContract("InMemoryDocumentStore", () => new InMemoryDocumentStore())
