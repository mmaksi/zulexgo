import { render, screen } from "@testing-library/react"
import { Wordmark } from "./wordmark"

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
