/**
 * The address a request came from, for counting attempts. Vercel sets
 * x-forwarded-for itself, whatever the client sent, so its first entry is the
 * caller; anywhere else that header is the caller's to forge.
 */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown"
}
