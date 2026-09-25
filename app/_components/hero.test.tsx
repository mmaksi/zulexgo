import { render, screen } from "@testing-library/react"
import { Hero } from "./hero"

// A description list pairs each term with its value; a label that is both the
// term and part of the value is announced twice by a screen reader.
describe("Hero stats", () => {
  it("pairs each label with its value, announcing each once", () => {
    render(<Hero />)

    const terms = screen.getAllByRole("term").map((term) => term.textContent)
    const values = screen.getAllByRole("definition").map((value) => value.textContent)

    expect(terms).toEqual([
      "Ausfüllen und bezahlen",
      "Termine bei der Behörde",
      "Online, ohne Kundenkonto",
    ])
    expect(values).toEqual(["10 Min.", "0", "100 %"])
  })
})
