import { readFileSync } from "node:fs"
import { readdir } from "node:fs/promises"
import { join } from "node:path"

/**
 * CLAUDE.md non-negotiable: the `X-Api-Key` is a merchant credential and must
 * never be reachable from the browser. This walks every module that ships to
 * the client and fails if one can read a server secret — so the guard is in
 * place before the Zulex and Stripe clients are written.
 */
const ROOTS = ["app", "src"]
const SOURCE = /\.(ts|tsx)$/
const SECRET_HEADERS = [/x-api-key/i, /x-idempotency-key/i]

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return sourceFiles(path)
      return SOURCE.test(entry.name) && !entry.name.includes(".test.")
        ? [path]
        : []
    })
  )
  return files.flat()
}

async function allSourceFiles(): Promise<string[]> {
  const perRoot = await Promise.all(ROOTS.map(sourceFiles))
  return perRoot.flat()
}

const isClientModule = (source: string) =>
  /^\s*["']use client["']/m.test(source)

describe("client bundle secrets", () => {
  let clientModules: { path: string; source: string }[]

  beforeAll(async () => {
    const paths = await allSourceFiles()
    clientModules = paths
      .map((path) => ({ path, source: readFileSync(path, "utf8") }))
      .filter(({ source }) => isClientModule(source))
  })

  it("finds the client modules it is meant to police", () => {
    // A guard that silently matches nothing is worse than no guard.
    expect(clientModules.length).toBeGreaterThan(0)
  })

  it("never reads a non-public environment variable from a client module", () => {
    const offenders = clientModules.filter(({ source }) =>
      Array.from(source.matchAll(/process\.env\.(\w+)/g)).some(
        ([, name]) => !name.startsWith("NEXT_PUBLIC_")
      )
    )

    expect(offenders.map(({ path }) => path)).toEqual([])
  })

  it("never names a merchant credential header in a client module", () => {
    const offenders = clientModules.filter(({ source }) =>
      SECRET_HEADERS.some((header) => header.test(source))
    )

    expect(offenders.map(({ path }) => path)).toEqual([])
  })

  it("keeps any API key out of every client module, server or not", () => {
    const offenders = clientModules.filter(({ source }) =>
      /(ZULEX|STRIPE)_(SECRET|API)_KEY/i.test(source)
    )

    expect(offenders.map(({ path }) => path)).toEqual([])
  })
})
