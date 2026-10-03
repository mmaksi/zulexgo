import "@testing-library/jest-dom"
import { expect as jestExpect } from "@jest/globals"
import { Secret } from "@/src/core/domain/secret"
import { SecurityCode } from "@/src/core/domain/vehicle/security-code"

/**
 * A secret keeps its value in a true private field, so `toEqual` sees nothing inside it and calls two
 * secrets with different values equal. A test that compares whole orders would then pass for a
 * repository that lost or changed an IBAN or a security code. Secrets are compared by their value,
 * which only a test may reveal this way. (`@jest/globals` is where `addEqualityTesters` is typed; its `expect`
 * is the global one.)
 */
jestExpect.addEqualityTesters([
  function secretsByValue(a, b, customTesters) {
    if (a instanceof Secret && b instanceof Secret) return this.equals(a.reveal(), b.reveal(), customTesters)
    if (a instanceof SecurityCode && b instanceof SecurityCode) return a.kind === b.kind && a.reveal() === b.reveal()
    if (a instanceof Secret || b instanceof Secret || a instanceof SecurityCode || b instanceof SecurityCode) return false
    return undefined
  },
])

/**
 * jsdom implements no PointerEvent, which Base UI's radio and checkbox
 * construct on click. A MouseEvent carrying the pointer fields stands in.
 */
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

/**
 * Base UI reports API misuse — a wrong `nativeButton`, a render target that
 * breaks a component's semantics — through `console.error` in development
 * only. A passing test run hides those messages, so they are promoted to
 * failures: a component that misuses the primitives is a broken component.
 */
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
