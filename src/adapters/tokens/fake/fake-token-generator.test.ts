import { tokenGeneratorContract } from "@/src/core/ports/token-generator.contract"
import { FakeTokenGenerator } from "./fake-token-generator"

tokenGeneratorContract("FakeTokenGenerator", () => new FakeTokenGenerator())

describe("FakeTokenGenerator", () => {
  it("is seeded, so a test can assert on the exact token it issued", () => {
    expect(new FakeTokenGenerator().generate()).toBe(new FakeTokenGenerator().generate())
  })

  it("labels its tokens as fake, so one can never be mistaken for a real link", () => {
    expect(new FakeTokenGenerator().generate()).toMatch(/^faketoken-/)
  })
})
