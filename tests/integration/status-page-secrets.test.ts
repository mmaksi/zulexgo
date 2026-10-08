import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { StatusView } from "@/app/status/[token]/_components/status-view"
import { seedDocumentsFor, seedFor } from "@/db/seed/seed"
import { aNewRegistrationApplication } from "@/tests/fixtures/applications"
import { secretsOf } from "@/tests/fixtures/secrets"
import { FakeClock } from "@/src/adapters/clock/fake/fake-clock"
import { FakePaymentProvider } from "@/src/adapters/payment/fake/fake-payment-provider"
import { InMemoryApplicationRepository } from "@/src/adapters/repository/fake/in-memory-application-repository"
import { InMemoryDocumentStore } from "@/src/adapters/storage/fake/in-memory-document-store"
import type { Application } from "@/src/core/domain/application/application"
import { getStatusByToken } from "@/src/core/use-cases/status/get-status-by-token"

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

/**
 * CLAUDE.md non-negotiable: security codes and status tokens never appear in
 * a rendered status page. Checked for an application in every status, as the
 * seed has one per status.
 */
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
      const html = renderToStaticMarkup(createElement(StatusView, { view, servicesOnSale: ["deregistration"], documentHref: (id: string) => `/status/${token}/documents/${id}`, cancelAction, correctAction }))
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
      const html = renderToStaticMarkup(createElement(StatusView, { view, servicesOnSale: ["deregistration"], documentHref: (id: string) => `/status/${statusToken}/documents/${id}`, cancelAction, correctAction }))

      expect(html.includes("/documents/")).toBe(application.status === "completed")
    }
  })

  const at = (status: Application["status"], minutes: number) => ({ status, at: new Date(Date.UTC(2026, 0, 1, 0, minutes)) })

  it.each([
    ["after an identity mismatch, when the owner's name can be corrected", [at("submitted_and_paid", 0), at("awaiting_identity_verification", 1), at("failed_correctable", 2)]],
    [
      "after the registration service refused it",
      [at("submitted_and_paid", 0), at("awaiting_identity_verification", 1), at("identity_verified", 2), at("submitted_to_kba", 3), at("failed_correctable", 4)],
    ],
  ])("shows no secret on a Neuzulassung's correction form, %s", async (_, history) => {
    const order = aNewRegistrationApplication({ status: "failed_correctable", history })
    const repository = new InMemoryApplicationRepository([{ application: order, statusToken: "faketoken-correction" }])
    const view = await getStatusByToken({ repository, documents, payments }, "faketoken-correction")

    const html = renderToStaticMarkup(createElement(StatusView, { view, servicesOnSale: ["deregistration"], documentHref: () => "#", cancelAction, correctAction }))

    expect(html).toContain('id="correct-evbNumber"')
    for (const secret of secretsOf(order.request)) expect(html).not.toContain(secret)
    expect(html).not.toContain("faketoken-correction")
  })
})
