import RegisterPage from "./page"
import ConfirmationPage from "./bestaetigung/page"

/**
 * The funnel collects an IBAN and a birth date, so it must not exist for a customer while checkout would refuse
 * the order. When launch plan N9 puts newRegistration on sale these become "renders the funnel" tests.
 */
describe("the Neuzulassung funnel while the service is not on sale", () => {
  it("is not found, so no page collects personal data for an order nobody can place", async () => {
    await expect(RegisterPage()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })
  })

  it("has no confirmation page either", async () => {
    await expect(ConfirmationPage({ searchParams: Promise.resolve({}) } as never)).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })
  })
})
