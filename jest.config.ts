import type { Config } from "jest"
import nextJest from "next/jest.js"

const createJestConfig = nextJest({ dir: "./" })

/**
 * CLAUDE.md: components and browser-side code run on jsdom; route handlers,
 * server actions and the Zulex/Stripe clients run on node. Two projects keep
 * both environments in a single `npm test` run.
 *
 * next/jest injects `transform` and `moduleNameMapper` at the root of the
 * config it returns, and Jest ignores root-level values of those when
 * `projects` is set — so each project is resolved through next/jest itself.
 */
const project = async (overrides: Config): Promise<Config> => {
  const config = (await createJestConfig({
    setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
    moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
    ...overrides,
  } as Config)()) as Config
  return { ...config, transformIgnorePatterns: TRANSFORM_IGNORE }
}

/**
 * next/jest never transforms node_modules and only lets a config append to
 * that rule. msw ships ESM-only dependencies Jest cannot `require`, so the
 * rule is replaced with one that lets exactly those through.
 */
const ESM_ONLY = ["rettime", "@open-draft/deferred-promise", "until-async"]
const TRANSFORM_IGNORE = [`/node_modules/(?!(${ESM_ONLY.join("|")})/)`, "^.+\\.module\\.(css|sass|scss)$"]

/**
 * No `collectCoverageFrom`: presentational components are deliberately
 * untested (see CLAUDE.md), so a whole-repo percentage would read as a gap to
 * close rather than a decision. `--coverage` reports what the tests touch.
 * Scope it to `src/core/**` once the domain logic lands.
 */
const jestConfig = async (): Promise<Config> => ({
  coverageProvider: "v8",
  projects: [
    await project({
      displayName: "jsdom",
      testEnvironment: "jsdom",
      testMatch: ["<rootDir>/**/*.test.tsx"],
    }),
    await project({
      displayName: "node",
      testEnvironment: "node",
      testMatch: ["<rootDir>/**/*.test.ts"],
    }),
  ],
})

export default jestConfig
