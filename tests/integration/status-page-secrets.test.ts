import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { StatusView } from "@/app/status/[token]/_components/status-view"
import { seedDocumentsFor, seedFor } from "@/db/seed/seed"
import { FakeClock } from "@/src/adapters/clock/fake/fake-clock"
import { FakePaymentProvider } from "@/src/adapters/payment/fake/fake-payment-provider"
import { InMemoryApplicationRepository } from "@/src/adapters/repository/fake/in-memory-application-repository"
import { InMemoryDocumentStore } from "@/src/adapters/storage/fake/in-memory-document-store"
import type { ServiceRequest } from "@/src/core/domain/application/service"
import { getStatusByToken } from "@/src/core/use-cases/status/get-status-by-token"

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

/**
 * CLAUDE.md non-negotiable: security codes and status tokens never appear in
 * a rendered status page. Checked for an application in every status, as the
 * seed has one per status.
 */
/** What the customer typed that must stay off the page: a de-registration's codes, everything a Neuzulassung's owner and car papers carry. */
function secretsOf(request: ServiceRequest): string[] {
  if (request.service === "deregistration") {
    const { rearPlate, frontPlate, certificate } = request.codes
    return [rearPlate, frontPlate, certificate].flatMap((code) => (code ? [code.reveal()] : []))
  }
  const { owner, bankAccount, registrationCertificate, evbNumber } = request
  const { iban, bic, bankName } = bankAccount.reveal()
  return [
    evbNumber.reveal(),
    registrationCertificate.number,
    registrationCertificate.securityCode.reveal(),
    iban,
    bic,
    bankName,
    owner.firstName,
    owner.lastName,
    owner.birthDate.reveal(),
    owner.birthPlace.reveal(),
    owner.phone.reveal(),
    owner.email,
    ...Object.values(owner.address.reveal()),
  ]
}

const seeded = seedFor("dev")
const repository = new InMemoryApplicationRepository(seeded)
const documents = new InMemoryDocumentStore(seedDocumentsFor("dev"))
const payments = new FakePaymentProvider(new FakeClock())
const cancelAction = async () => ({ status: "done" as const })
const correctAction = async () => ({ status: "done" as const })

describe("the rendered status page", () => {
  it.each(seeded.map(({ application, statusToken }) => [application.status, application, statusToken] as const))(
    "shows no security code, token or full VIN at %s",
    async (_, application, token) => {
      const view = await getStatusByToken({ repository, documents, payments }, token)
      const html = renderToStaticMarkup(createElement(StatusView, { view, documentHref: (id: string) => `/status/${token}/documents/${id}`, cancelAction, correctAction }))
      const { request } = application

      expect(html).toContain(application.reference)
      for (const secret of secretsOf(request)) expect(html).not.toContain(secret)
      // The link to a document is the one place the page repeats its own token: it is where the download lives.
      expect(html.replaceAll(`/status/${token}/documents/`, "")).not.toContain(token)
      expect(html).not.toContain(request.vin)
    },
  )

  it("offers the seeded confirmation for download on the completed order, and no download anywhere else", async () => {
    for (const { application, statusToken } of seeded) {
      const view = await getStatusByToken({ repository, documents, payments }, statusToken)
      const html = renderToStaticMarkup(createElement(StatusView, { view, documentHref: (id: string) => `/status/${statusToken}/documents/${id}`, cancelAction, correctAction }))

      expect(html.includes("/documents/")).toBe(application.status === "completed")
    }
  })
})
