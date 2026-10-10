import "@testing-library/jest-dom"
import { expect as jestExpect } from "@jest/globals"
import { Secret } from "@/src/core/domain/secret"
import { SecurityCode } from "@/src/core/domain/vehicle/security-code"

// A Secret's value sits in a private field toEqual cannot see, so secrets are compared by value.
jestExpect.addEqualityTesters([
  function secretsByValue(a, b, customTesters) {
    if (a instanceof Secret && b instanceof Secret) return this.equals(a.reveal(), b.reveal(), customTesters)
    if (a instanceof SecurityCode && b instanceof SecurityCode) return a.kind === b.kind && a.reveal() === b.reveal()
    if (a instanceof Secret || b instanceof Secret || a instanceof SecurityCode || b instanceof SecurityCode) return false
    return undefined
  },
])

// jsdom has no PointerEvent, which Base UI's radio and checkbox construct on click.
if (typeof window !== "undefined" && !window.PointerEvent) {
  class PointerEvent extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
      this.pointerType = init.pointerType ?? "mouse"
    }
  }
  window.PointerEvent = PointerEvent as typeof window.PointerEvent
}

const BASE_UI_MISUSE = /^Base UI:/

let consoleError: jest.SpyInstance<void, Parameters<typeof console.error>>

beforeEach(() => {
  consoleError = jest.spyOn(console, "error")
})

afterEach(() => {
  const offenders = consoleError.mock.calls
    .map(([first]) => String(first))
    .filter((message) => BASE_UI_MISUSE.test(message))

  consoleError.mockRestore()

  if (offenders.length > 0) {
    throw new Error(
      `Base UI reported API misuse:\n\n${offenders.join("\n\n")}`
    )
  }
})
