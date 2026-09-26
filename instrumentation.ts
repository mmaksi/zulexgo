/**
 * Runs once per server instance, before it takes a request. Building the
 * container parses the environment, so a misconfigured deploy refuses to start
 * instead of failing halfway through a customer's checkout.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { getContainer } = await import("@/src/config/container")
  getContainer()
}
