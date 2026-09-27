import { applicationRepositoryContract } from "@/src/core/ports/application-repository.contract"
import { InMemoryApplicationRepository } from "./in-memory-application-repository"

applicationRepositoryContract("InMemoryApplicationRepository", () => new InMemoryApplicationRepository())
