import { render, screen, within } from "@testing-library/react"
import { formatEuros } from "@/src/core/domain/payment/money"
import { SERVICE_PRICES } from "@/src/core/domain/payment/pricing"
import { ServiceSelection } from "./service-selection"

/**
 * prd.md §3 — the MVP sells de-registration only. Making another card
 * actionable would take money for a service that does not exist, and nothing
 * else in the build would catch it. Which services a deployment sells is its
 * setting (`SERVICES_ON_SALE`); the cards only follow it.
 */
describe("ServiceSelection", () => {
  it("offers exactly one purchasable service", () => {
    render(<ServiceSelection servicesOnSale={["deregistration"]} />)

    const actions = screen.getAllByRole("link")
    expect(actions).toHaveLength(1)
    expect(actions[0]).toHaveAccessibleName(/jetzt abmelden/i)
  })

  it("offers each service the deployment sells, and no other", () => {
    render(<ServiceSelection servicesOnSale={["deregistration", "newRegistration"]} />)

    const actions = screen.getAllByRole("link")
    expect(actions.map((action) => action.getAttribute("href")).sort()).toEqual(["/deregister", "/register"])
    expect(screen.getAllByText("Bald verfügbar")).toHaveLength(screen.getAllByRole("listitem").length - 2)
  })

  it("says which services are for invited customers only, and still links to them so an invited customer can start", () => {
    render(<ServiceSelection servicesOnSale={["deregistration", "newRegistration"]} betaServices={["newRegistration"]} />)

    const badge = screen.getByText("Nur mit Einladung")
    const card = badge.closest("li")!
    expect(screen.getAllByText("Nur mit Einladung")).toHaveLength(1)
    expect(within(card).getByRole("link", { name: /jetzt zulassen/i })).toHaveAttribute("href", "/register")
  })

  it("marks no service for invited customers when none is in beta", () => {
    render(<ServiceSelection servicesOnSale={["deregistration", "newRegistration"]} />)

    expect(screen.queryByText("Nur mit Einladung")).not.toBeInTheDocument()
  })

  it("marks every other service as unavailable, not merely unlinked", () => {
    render(<ServiceSelection servicesOnSale={["deregistration"]} />)

    // aria-disabled so the state reaches assistive tech, plus visible copy.
    const items = screen.getAllByRole("listitem")
    const unavailable = items.filter((item) =>
      item.querySelector('[aria-disabled="true"]')
    )

    expect(unavailable).toHaveLength(items.length - 1)
    expect(screen.getAllByText("Bald verfügbar")).toHaveLength(unavailable.length)
  })
})

/**
 * One price everywhere (PAngV): a card that quoted a different amount than the
 * checkout charges would be an offer the business has to honour or break.
 */
describe("ServiceSelection prices", () => {
  const cards = () => screen.getAllByRole("listitem")

  it("shows on the de-registration card what the checkout charges", () => {
    render(<ServiceSelection servicesOnSale={["deregistration"]} />)

    const card = cards().find((item) => within(item).queryByRole("link"))!
    expect(card.textContent).toContain(formatEuros(SERVICE_PRICES.deregistration))
  })

  it("quotes every service at its price from the price list, as a final price", () => {
    render(<ServiceSelection servicesOnSale={["deregistration"]} />)

    const listed = Object.values(SERVICE_PRICES).map(formatEuros)
    const shown = cards().map((card) => card.textContent!.match(/\d+,\d{2}\s€/)?.[0])

    expect(shown).toHaveLength(Object.keys(SERVICE_PRICES).length)
    shown.forEach((price) => expect(listed).toContain(price))
    expect(screen.queryByText(/\bab\b\s*\d/)).not.toBeInTheDocument()
  })
})
