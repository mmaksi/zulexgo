import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MobileNav } from "./mobile-nav"

const ITEMS = [
  { label: "Leistungen", href: "/#leistungen" },
  { label: "Ablauf", href: "/#ablauf" },
  { label: "Fragen", href: "/#fragen" },
] as const

/**
 * The only navigation below the desktop breakpoint, and where routing
 * destinations through SheetClose previously turned the links into buttons.
 */
describe("MobileNav", () => {
  const open = async () => {
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /menü öffnen/i }))
    return user
  }

  it("keeps the panel closed until the trigger is used", () => {
    render(<MobileNav items={ITEMS} />)

    expect(screen.queryByRole("link", { name: "Leistungen" })).not.toBeInTheDocument()
  })

  it("exposes the destinations as links, not buttons", async () => {
    render(<MobileNav items={ITEMS} />)
    await open()

    ITEMS.forEach((item) => {
      expect(screen.getByRole("link", { name: item.label })).toHaveAttribute(
        "href",
        item.href
      )
    })
  })

  it("carries the primary action the mobile header cannot fit", async () => {
    render(<MobileNav items={ITEMS} />)
    await open()

    expect(screen.getByRole("link", { name: /jetzt abmelden/i })).toHaveAttribute(
      "href",
      "/#leistungen"
    )
  })

  it("closes again when a destination is chosen", async () => {
    render(<MobileNav items={ITEMS} />)
    const user = await open()

    await user.click(screen.getByRole("link", { name: "Ablauf" }))

    expect(screen.queryByRole("link", { name: "Ablauf" })).not.toBeInTheDocument()
  })

  it("closes on Escape so the panel is never a trap", async () => {
    render(<MobileNav items={ITEMS} />)
    const user = await open()

    await user.keyboard("{Escape}")

    expect(screen.queryByRole("link", { name: "Leistungen" })).not.toBeInTheDocument()
  })

  it("names the close control in German, like the rest of the page", async () => {
    render(<MobileNav items={ITEMS} />)
    await open()

    expect(screen.getByRole("button", { name: "Menü schließen" })).toBeInTheDocument()
  })
})
