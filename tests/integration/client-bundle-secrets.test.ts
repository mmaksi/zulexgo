import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"

/**
 * CLAUDE.md non-negotiable: the `X-Api-Key` is a merchant credential and must
 * never be reachable from the browser. A client module ships everything it
 * imports, so this walks the import graph from every `"use client"` module and
 * fails if any module it reaches can read a server secret — so the guard is in
 * place before the Zulex and Stripe clients are written.
 *
 * `import "server-only"` makes `next build` fail on the same mistake, and CI
 * greps the built client chunks for a canary secret; this is the fast check.
 */
const ROOT = resolve(__dirname, "../..")
const ROOTS = ["app", "src"]
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"]
const SECRET_HEADERS = [/x-api-key/i, /x-idempotency-key/i]

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.") ? [path] : []
  })
}

const isClientModule = (source: string) => /^\s*["']use client["']/m.test(source)

const specifiers = (source: string) =>
  Array.from(
    source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g),
    ([, specifier]) => specifier
  )

/** Resolves app-local imports only; npm packages are not ours to police here. */
function resolveLocal(specifier: string, importer: string): string | undefined {
  const base = specifier.startsWith("@/")
    ? join(ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(importer), specifier)
      : undefined
  if (!base) return undefined
  return [base, ...EXTENSIONS.map((extension) => base + extension)].find(
    (candidate) => existsSync(candidate) && /\.tsx?$/.test(candidate)
  )
}

function reachableFrom(entry: string): string[] {
  const seen = new Set<string>()
  const pending = [entry]
  while (pending.length > 0) {
    const path = pending.pop()!
    if (seen.has(path)) continue
    seen.add(path)
    for (const specifier of specifiers(readFileSync(path, "utf8"))) {
      const next = resolveLocal(specifier, path)
      if (next) pending.push(next)
    }
  }
  return [...seen]
}

const leaks = {
  "reads a non-public environment variable": (source: string) =>
    Array.from(source.matchAll(/process\.env\.(\w+)/g)).some(
      ([, name]) => !name.startsWith("NEXT_PUBLIC_")
    ) || /process\.env(?!\.)/.test(source),
  "names a merchant credential header": (source: string) =>
    SECRET_HEADERS.some((header) => header.test(source)),
  "names a server API key": (source: string) => /(ZULEX|STRIPE)_(SECRET|API)_KEY/i.test(source),
  "is marked server-only": (source: string) => /import\s+["']server-only["']/.test(source),
}

function offendersIn(clientEntries: string[]) {
  return clientEntries.flatMap((entry) =>
    reachableFrom(entry).flatMap((path) =>
      Object.entries(leaks)
        .filter(([, leaks]) => leaks(readFileSync(path, "utf8")))
        .map(([why]) => `${relative(ROOT, entry)} → ${relative(ROOT, path)} ${why}`)
    )
  )
}

describe("client bundle secrets", () => {
  const clientModules = ROOTS.flatMap((root) => sourceFiles(join(ROOT, root))).filter((path) =>
    isClientModule(readFileSync(path, "utf8"))
  )

  it("finds the client modules it is meant to police", () => {
    // A guard that silently matches nothing is worse than no guard.
    expect(clientModules.length).toBeGreaterThan(0)
  })

  it("follows imports, so a server module pulled into a client one is caught", () => {
    // The composition root reads process.env and is server-only; a client
    // entry that imported it must be reported through the graph, not missed.
    const container = join(ROOT, "src/config/container.ts")
    expect(offendersIn([container]).join("\n")).toMatch(/src\/config\/env\.ts reads a non-public/)
  })

  it("never lets a client module reach a server secret", () => {
    expect(offendersIn(clientModules)).toEqual([])
  })
})
