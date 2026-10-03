import { applicationRepositoryContract } from "@/src/core/ports/repository/application-repository.contract"
import { InMemoryApplicationRepository } from "./in-memory-application-repository"

applicationRepositoryContract("InMemoryApplicationRepository", () => new InMemoryApplicationRepository())
