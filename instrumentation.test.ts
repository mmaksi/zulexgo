const ORIGINAL_ENV = process.env

async function registerWith(env: Record<string, string>) {
  process.env = { NODE_ENV: ORIGINAL_ENV.NODE_ENV, ...env, NEXT_RUNTIME: "nodejs" }
  // getContainer() memoises per process; each case needs a fresh module graph.
  const { register } = await import("./instrumentation")
  return register()
}

describe("server start", () => {
  beforeEach(() => jest.resetModules())
  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it("refuses to start on an invalid environment, naming the variable", async () => {
    await expect(registerWith({ APP_ENV: "staging" })).rejects.toThrow(/APP_BASE_URL/)
  })

  it("refuses to start when APP_ENV is missing", async () => {
    await expect(registerWith({})).rejects.toThrow(/APP_ENV/)
  })

  it("starts on a valid environment", async () => {
    await expect(registerWith({ APP_ENV: "dev" })).resolves.toBeUndefined()
  })
})
