import { render, screen } from "@testing-library/react"
import { SiteFooter } from "./site-footer"

// § 5 DDG and the GDPR: Impressum, AGB and Datenschutz must be reachable from every page
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
