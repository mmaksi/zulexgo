import type { Config } from "jest"
import nextJest from "next/jest.js"

const createJestConfig = nextJest({ dir: "./" })

// Under `projects` Jest ignores next/jest's root transform and moduleNameMapper, so each project calls it.
const project = async (overrides: Config): Promise<Config> => {
  const config = (await createJestConfig({
    setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
    moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
    ...overrides,
  } as Config)()) as Config
  return { ...config, transformIgnorePatterns: TRANSFORM_IGNORE }
}

// next/jest's node_modules rule can only be appended to, so it is replaced to transform msw's ESM-only deps.
const ESM_ONLY = ["rettime", "@open-draft/deferred-promise", "until-async"]
const TRANSFORM_IGNORE = [`/node_modules/(?!(${ESM_ONLY.join("|")})/)`, "^.+\\.module\\.(css|sass|scss)$"]

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
