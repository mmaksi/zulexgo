import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { StatusView } from "@/app/status/[token]/_components/status-view"
import { seedFor } from "@/db/seed/seed"
import { InMemoryApplicationRepository } from "@/src/adapters/repository/fake/in-memory-application-repository"
import { getStatusByToken } from "@/src/core/use-cases/get-status-by-token"

/**
 * CLAUDE.md non-negotiable: security codes and status tokens never appear in
 * a rendered status page. Checked for an application in every status, as the
 * seed has one per status.
 */
const seeded = seedFor("dev")
const repository = new InMemoryApplicationRepository(seeded)

describe("the rendered status page", () => {
  it.each(seeded.map(({ application, statusToken }) => [application.status, application, statusToken] as const))(
    "shows no security code, token or full VIN at %s",
    async (_, application, token) => {
      const html = renderToStaticMarkup(createElement(StatusView, { view: await getStatusByToken({ repository }, token) }))
      const { codes, vin } = application.request

      expect(html).toContain(application.reference)
      for (const code of [codes.rearPlate, codes.frontPlate, codes.certificate]) {
        if (code) expect(html).not.toContain(code.reveal())
      }
      expect(html).not.toContain(token)
      expect(html).not.toContain(vin)
    },
  )
})
