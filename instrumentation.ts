export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { getContainer } = await import("@/src/config/container")
  getContainer()
}
