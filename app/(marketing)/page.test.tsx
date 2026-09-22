import { render, screen } from "@testing-library/react"
import LandingPage from "./page"

/**
 * Heading structure is an accessibility contract that breaks invisibly: a
 * second H1 or a skipped level is invisible on screen and wrong for screen
 * readers and search engines.
 */
describe("Landing page", () => {
  it("has exactly one H1", () => {
    render(<LandingPage />)

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
  })

  it("never skips a heading level", () => {
    render(<LandingPage />)

    const levels = screen
      .getAllByRole("heading")
      .map((heading) => Number(heading.tagName.slice(1)))
    const present = Array.from(new Set(levels)).sort()

    expect(present).toEqual(present.map((_, index) => index + 1))
  })

  it("exposes the anchor targets the navigation relies on", () => {
    const { container } = render(<LandingPage />)

    const ids = Array.from(container.querySelectorAll("section[id]")).map((s) =>
      s.getAttribute("id")
    )

    expect(ids).toEqual(expect.arrayContaining(["leistungen", "ablauf", "fragen"]))
  })
})
