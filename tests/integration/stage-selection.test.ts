import { readFileSync } from "node:fs"
import { readdir } from "node:fs/promises"
import { join } from "node:path"

/**
 * `environments` skill: `next build` sets `NODE_ENV=production` for the staging
 * build too, so any behaviour that branches on it is wrong in exactly the place
 * it matters. `APP_ENV`, read through `src/config/env.ts`, is the only switch.
 */
const ROOTS = ["app", "src"]
const SOURCE = /\.(ts|tsx)$/

export const readsNodeEnv = (source: string) => /process\.env\.NODE_ENV/.test(source)

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return sourceFiles(path)
      return SOURCE.test(entry.name) ? [path] : []
    })
  )
  return files.flat()
}

describe("stage selection", () => {
  it("catches a file that branches on NODE_ENV", () => {
    // A scan that can only ever pass is not a guard.
    expect(readsNodeEnv('if (process.env.NODE_ENV === "production") {}')).toBe(true)
    expect(readsNodeEnv('if (env.APP_ENV === "production") {}')).toBe(false)
  })

  it("has no source file that branches on NODE_ENV", async () => {
    const paths = (await Promise.all(ROOTS.map(sourceFiles))).flat()
    const offenders = paths.filter((path) => readsNodeEnv(readFileSync(path, "utf8")))

    expect(offenders).toEqual([])
  })

  it("policed a non-empty set of files", async () => {
    const paths = (await Promise.all(ROOTS.map(sourceFiles))).flat()

    expect(paths.length).toBeGreaterThan(0)
  })
})
