import { cn } from "./utils"

describe("cn", () => {
  it.each(["h1", "h2", "h3", "h4", "subtitle", "body", "small"])(
    "keeps the text-%s size when a text colour follows",
    (size) => {
      expect(cn(`text-${size} text-grau-dark`)).toBe(`text-${size} text-grau-dark`)
    }
  )

  it("lets a later size override an earlier one", () => {
    expect(cn("text-body", "text-small")).toBe("text-small")
  })

  it("keeps an elevation when a shadow colour follows", () => {
    expect(cn("shadow-elev-1 shadow-grau")).toBe("shadow-elev-1 shadow-grau")
  })

  it("lets a later easing override an earlier one", () => {
    expect(cn("ease-standard", "ease-enter")).toBe("ease-enter")
  })
})
