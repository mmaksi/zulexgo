import { render, screen } from "@testing-library/react"
import { ServiceSelection } from "./service-selection"

/**
 * prd.md §3 — the MVP sells de-registration only. Making another card
 * actionable would take money for a service that does not exist, and nothing
 * else in the build would catch it.
 */
describe("ServiceSelection", () => {
  it("offers exactly one purchasable service", () => {
    render(<ServiceSelection />)

    const actions = screen.getAllByRole("link")
    expect(actions).toHaveLength(1)
    expect(actions[0]).toHaveAccessibleName(/jetzt abmelden/i)
  })

  it("marks every other service as unavailable, not merely unlinked", () => {
    render(<ServiceSelection />)

    // aria-disabled so the state reaches assistive tech, plus visible copy.
    const items = screen.getAllByRole("listitem")
    const unavailable = items.filter((item) =>
      item.querySelector('[aria-disabled="true"]')
    )

    expect(unavailable).toHaveLength(items.length - 1)
    expect(screen.getAllByText("Bald verfügbar")).toHaveLength(unavailable.length)
  })
})
