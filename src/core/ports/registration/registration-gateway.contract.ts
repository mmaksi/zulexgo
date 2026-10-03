import { FAKE_REQUEST } from "@/tests/fixtures/applications"
import { parseDeregistrationRequest } from "@/src/core/domain/application/deregistration-request"
import type { RegistrationGateway } from "./registration-gateway"

const request = parseDeregistrationRequest(FAKE_REQUEST)

/**
 * Every RegistrationGateway adapter must pass this, including the fake.
 *
 * Pins down only what the real service and the fake share: one application
 * per idempotency key, a fresh submission reporting `inProgress`, and
 * authorities that each carry a valid i-Kfz status. The error mapping, status
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

    it("files one application per idempotency key, so a network retry never files twice", async () => {
      const first = await gateway.submitDeregistration(request, "contract-key-1")
      const retried = await gateway.submitDeregistration(request, "contract-key-1")
      const other = await gateway.submitDeregistration(request, "contract-key-2")

      expect(retried.applicationId).toBe(first.applicationId)
      expect(other.applicationId).not.toBe(first.applicationId)
    })

    it("reports a fresh submission as in progress", async () => {
      const { applicationId } = await gateway.submitDeregistration(request, "contract-key-3")

      expect(await gateway.getStatus(applicationId)).toEqual({ state: "inProgress" })
    })

    it("returns the authorities for a plate prefix", async () => {
      const authorities = await gateway.findAuthorities(FAKE_REQUEST.licencePlate.prefix)

      expect(authorities.length).toBeGreaterThan(0)
      for (const authority of authorities) expect(["online", "unavailable", "offline"]).toContain(authority.ikfzStatus)
    })
  })
}
