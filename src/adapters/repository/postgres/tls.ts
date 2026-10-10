import type { ConnectionOptions } from "node:tls"

const THIS_MACHINE = new Set(["", "localhost", "127.0.0.1", "[::1]"])

// pg sends plain text unless told otherwise; without `ca` the link is encrypted but the server unverified.
export function tlsFor(connectionString: string, ca?: string): false | ConnectionOptions {
  if (THIS_MACHINE.has(hostOf(connectionString))) return false
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false }
}

/** Node's own error carries the whole string, password included, and would print it at boot. */
function hostOf(connectionString: string): string {
  try {
    return new URL(connectionString).hostname
  } catch {
    throw new Error("The database connection string is not a valid URL (a password with # or / must be URL-encoded)")
  }
}
