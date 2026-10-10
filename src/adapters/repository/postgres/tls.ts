import type { ConnectionOptions } from "node:tls"

/** Where dev and CI run their Postgres; an empty host is a Unix socket. */
const THIS_MACHINE = new Set(["", "localhost", "127.0.0.1", "[::1]"])

/**
 * pg's `ssl` option for a connection string. pg sends plain text unless told otherwise, and Supabase
 * accepts plain text unless SSL is enforced, so every other database gets TLS. With `ca`
 * (`DATABASE_CA_CERT`, the project's root certificate) the server's certificate and host name are checked;
 * without it the link is still encrypted, but whoever answers is believed.
 */
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
