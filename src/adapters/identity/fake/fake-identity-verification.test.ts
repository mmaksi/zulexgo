import { identityVerificationContract } from "@/src/core/ports/identity/identity-verification.contract"
import { FakeIdentityVerification } from "./fake-identity-verification"

identityVerificationContract("FakeIdentityVerification", () => {
  const verification = new FakeIdentityVerification()
  return { verification, customerFinishes: (id, outcome) => verification.customerFinishes(id, outcome) }
})
