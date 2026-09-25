import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Faq } from "./faq"

const OFFICIAL_ANSWER = /amtliche i-Kfz-Schnittstelle des Kraftfahrt-Bundesamtes/i

/** Disclosure behaviour, plus the keepMounted guarantee the copy relies on. */
describe("Faq", () => {
  it("starts with every answer collapsed", () => {
    render(<Faq />)

    screen
      .getAllByRole("button")
      .forEach((question) => expect(question).toHaveAttribute("aria-expanded", "false"))
  })

  it("reveals an answer when its question is activated", async () => {
    const user = userEvent.setup()
    render(<Faq />)

    const question = screen.getByRole("button", {
      name: /Ist die Online-Abmeldung offiziell gültig\?/,
    })
    await user.click(question)

    expect(question).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText(OFFICIAL_ANSWER)).toBeVisible()
  })

  it("collapses the answer again on a second activation", async () => {
    const user = userEvent.setup()
    render(<Faq />)

    const question = screen.getByRole("button", { name: /Brauche ich ein Kundenkonto\?/ })
    await user.click(question)
    await user.click(question)

    expect(question).toHaveAttribute("aria-expanded", "false")
  })

  it("is operable by keyboard alone", async () => {
    const user = userEvent.setup()
    render(<Faq />)

    const question = screen.getAllByRole("button")[0]
    question.focus()
    await user.keyboard("{Enter}")

    expect(question).toHaveAttribute("aria-expanded", "true")
  })

  it("keeps answers in the document so they survive without JavaScript", () => {
    render(<Faq />)

    expect(screen.getByText(OFFICIAL_ANSWER)).toBeInTheDocument()
  })
})
