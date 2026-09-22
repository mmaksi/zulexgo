import { render, screen } from "@testing-library/react"
import { Wordmark } from "./wordmark"

/**
 * Regression guard: the two-tone split used to leave the lockup with no
 * accessible name, so it announced as the fragments "Zulex" and "Go" plus a
 * stray tagline. The colour split itself is a design rule — checked in a
 * browser, not here.
 */
describe("Wordmark", () => {
  it("announces as a single logotype rather than two text runs", () => {
    render(<Wordmark />)

    expect(screen.getByRole("img", { name: "ZulexGO" })).toBeInTheDocument()
  })

  it("keeps that accessible name on dark surfaces", () => {
    render(<Wordmark tone="dark" />)

    expect(screen.getByRole("img", { name: "ZulexGO" })).toBeInTheDocument()
  })
})
