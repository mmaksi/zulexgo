import { render, screen } from "@testing-library/react"
import { SiteHeader } from "./site-header"

/**
 * Regression guard: the header is shared with /impressum and the legal pages,
 * where the original bare `#hash` targets silently did nothing. typedRoutes is
 * off, so nothing else catches it.
 */
describe("SiteHeader", () => {
  it("points in-page anchors at the landing page, not the current one", () => {
    render(<SiteHeader />)

    const nav = screen.getByRole("navigation", { name: /hauptnavigation/i })
    const links = Array.from(nav.querySelectorAll("a"))

    expect(links.length).toBeGreaterThan(0)
    links.forEach((link) => expect(link.getAttribute("href")).toMatch(/^\/#/))
  })

  it("routes the primary action and the wordmark absolutely too", () => {
    render(<SiteHeader />)

    expect(screen.getByRole("link", { name: /zur startseite/i })).toHaveAttribute(
      "href",
      "/"
    )
    expect(screen.getByRole("link", { name: /abmeldung starten/i })).toHaveAttribute(
      "href",
      "/#leistungen"
    )
  })
})
