import { render, screen } from "@testing-library/react"
import { SiteFooter } from "./site-footer"

/**
 * § 5 TMG and the GDPR require Impressum, AGB and Datenschutz to be reachable
 * from every page. This is a compliance rule rather than copy, and with
 * typedRoutes off a link to a route that does not exist fails silently.
 */
describe("SiteFooter", () => {
  it("reaches all three statutory pages", () => {
    render(<SiteFooter />)

    const legal = screen.getByRole("navigation", { name: /rechtliches/i })
    const hrefs = Array.from(legal.querySelectorAll("a")).map((a) =>
      a.getAttribute("href")
    )

    expect(hrefs).toEqual(["/impressum", "/agb", "/datenschutz"])
  })
})
