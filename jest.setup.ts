import "@testing-library/jest-dom"

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
