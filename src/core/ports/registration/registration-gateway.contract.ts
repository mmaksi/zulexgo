import { FAKE_REQUEST } from "@/tests/fixtures/applications"
import { parseDeregistrationRequest } from "@/src/core/domain/application/deregistration-request"
import type { RegistrationGateway } from "./registration-gateway"

const request = parseDeregistrationRequest(FAKE_REQUEST)

/**
 * Every RegistrationGateway adapter must pass this, including the fake.
 *
 * Pins down only what the real service and the fake share: one application
 * per idempotency key, a fresh submission reporting `inProgress`, and
 * authorities, found by plate prefix or by postcode, that each carry a valid i-Kfz status. The error mapping, status
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
      const first = await gateway.submit(request, "contract-key-1")
      const retried = await gateway.submit(request, "contract-key-1")
      const other = await gateway.submit(request, "contract-key-2")

      expect(retried.applicationId).toBe(first.applicationId)
      expect(other.applicationId).not.toBe(first.applicationId)
    })

    it("reports a fresh submission as in progress", async () => {
      const { applicationId } = await gateway.submit(request, "contract-key-3")

      expect(await gateway.getStatus("deregistration", applicationId)).toEqual({ state: "inProgress" })
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
