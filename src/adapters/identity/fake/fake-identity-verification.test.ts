import { identityVerificationContract } from "@/src/core/ports/identity/identity-verification.contract"
import { FakeIdentityVerification } from "./fake-identity-verification"

identityVerificationContract("FakeIdentityVerification", () => {
  const verification = new FakeIdentityVerification()
  return {
    verification,
    customerFinishes: (id, finish) => verification.customerFinishes(id, finish),
    notificationOf: (id) => verification.notificationOf(id),
  }
})
