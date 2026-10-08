import { FAKE_REQUEST } from "@/tests/fixtures/applications"
import { FAKE_NEW_REGISTRATION, FAKE_NEW_REGISTRATION_NOW } from "@/tests/fixtures/new-registration"
import { parseDeregistrationRequest } from "@/src/core/domain/application/deregistration-request"
import { parseNewRegistrationRequest } from "@/src/core/domain/application/new-registration-request"
import type { RegistrationGateway } from "./registration-gateway"

const REQUESTS = [
  ["a de-registration", parseDeregistrationRequest(FAKE_REQUEST)],
  ["a Neuzulassung", parseNewRegistrationRequest(FAKE_NEW_REGISTRATION, FAKE_NEW_REGISTRATION_NOW)],
] as const

/**
 * Every RegistrationGateway adapter must pass this, including the fake.
 *
 * Pins down only what the real service and the fake share, for each service: one application
 * per idempotency key and a fresh submission reporting `inProgress`; and authorities, found by
 * plate prefix or by postcode, that each carry a valid i-Kfz status. The error mapping, status
 * parsing, `retry`, `correct` and `fetchDocument` are left to each adapter's own
 * tests. The Zulex adapter runs this against a network stub that models a
 * replayed key; the live service is unconfirmed (launch plan Q23).
 */
export function registrationGatewayContract(name: string, makeSubject: () => RegistrationGateway) {
  describe(`RegistrationGateway contract: ${name}`, () => {
    let gateway: RegistrationGateway
    beforeEach(() => {
      gateway = makeSubject()
    })

    it.each(REQUESTS)("files one application per idempotency key for %s, so a network retry never files twice", async (_, request) => {
      const first = await gateway.submit(request, "contract-key-1")
      const retried = await gateway.submit(request, "contract-key-1")
      const other = await gateway.submit(request, "contract-key-2")

      expect(retried.applicationId).toBe(first.applicationId)
      expect(other.applicationId).not.toBe(first.applicationId)
    })

    it.each(REQUESTS)("reports a fresh submission of %s as in progress", async (_, request) => {
      const { applicationId } = await gateway.submit(request, "contract-key-3")

      expect(await gateway.getStatus(request.service, applicationId)).toEqual({ state: "inProgress" })
    })

    it.each([
      ["plate prefix", { prefix: FAKE_REQUEST.licencePlate.prefix }],
      ["postcode", { postcode: "10115" }],
    ])("returns the authorities for a %s", async (_, where) => {
      const authorities = await gateway.findAuthorities(where)

      expect(authorities.length).toBeGreaterThan(0)
      for (const authority of authorities) expect(["online", "unavailable", "offline"]).toContain(authority.ikfzStatus)
    })
  })
}
