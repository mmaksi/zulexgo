import { act, render } from "@testing-library/react"
import { StatusRefresh } from "./status-refresh"

const refresh = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

const INTERVAL = 30_000

beforeEach(() => {
  jest.useFakeTimers()
  refresh.mockClear()
})
afterEach(() => jest.useRealTimers())

describe("StatusRefresh", () => {
  it("asks the server for the latest status every half minute while the order is in progress", () => {
    render(<StatusRefresh active />)

    act(() => jest.advanceTimersByTime(INTERVAL))
    expect(refresh).toHaveBeenCalledTimes(1)

    act(() => jest.advanceTimersByTime(2 * INTERVAL))
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it("asks again the moment the customer comes back to the tab", () => {
    render(<StatusRefresh active />)

    act(() => {
      window.dispatchEvent(new Event("focus"))
    })

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("stops for good once the order has an outcome, so a finished page is never polled", () => {
    const { rerender } = render(<StatusRefresh active />)

    rerender(<StatusRefresh active={false} />)
    act(() => {
      jest.advanceTimersByTime(5 * INTERVAL)
      window.dispatchEvent(new Event("focus"))
    })

    expect(refresh).not.toHaveBeenCalled()
  })

  it("stops when the page is closed", () => {
    const { unmount } = render(<StatusRefresh active />)

    unmount()
    act(() => {
      jest.advanceTimersByTime(INTERVAL)
      window.dispatchEvent(new Event("focus"))
    })

    expect(refresh).not.toHaveBeenCalled()
  })
})
