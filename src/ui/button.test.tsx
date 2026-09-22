import { buttonLink } from "./button"

/**
 * Regression guard: `buttonLink` exists because raw `buttonVariants()` only
 * concatenates. The base sets `border-transparent` and the outline variant
 * sets `border-grau`, so unmerged output silently rendered the secondary
 * button with no border at all.
 */
describe("buttonLink", () => {
  it("resolves the border conflict the outline variant depends on", () => {
    const classes = buttonLink({ variant: "outline" })

    expect(classes).toContain("border-grau")
    expect(classes).not.toContain("border-transparent")
  })

  it("lets a caller override a base utility", () => {
    const classes = buttonLink({ className: "hidden sm:inline-flex" })

    expect(classes).toContain("hidden")
    expect(classes.split(" ")).not.toContain("inline-flex")
  })
})
