import { act } from "@testing-library/react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { useHydrated } from "./use-hydrated"

function Probe() {
  return <output>{useHydrated() ? "hydrated" : "not yet"}</output>
}

describe("useHydrated", () => {
  it("is false in the HTML the server sends", () => {
    expect(renderToString(<Probe />)).toContain("not yet")
  })

  it("turns true once the browser has hydrated that HTML", async () => {
    const container = document.createElement("div")
    container.innerHTML = renderToString(<Probe />)
    document.body.append(container)

    await act(async () => {
      hydrateRoot(container, <Probe />)
    })

    expect(container).toHaveTextContent("hydrated")
    container.remove()
  })
})
