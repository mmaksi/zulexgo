/**
 * The address a request came from, for counting attempts. Vercel sets
 * x-forwarded-for itself, whatever the client sent, so its first entry is the
 * caller; anywhere else that header is the caller's to forge.
 *
 * An IPv6 caller is counted by the /64 they hold, since one subscriber can
 * pick any address inside it and would otherwise start every request with a
 * fresh count.
 *
 * The key behind every public rate limit (status lookup, order changes,
 * document downloads, resend-link requests). `x-real-ip` is the fallback and
 * carries the same caveat. When neither header holds an address the result is
 * "unknown", one shared key: such requests count together rather than escaping
 * the limit. A value that is not a recognisable address is returned as it came.
 */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return countedAs(forwarded || headers.get("x-real-ip")?.trim() || "unknown")
}

/**
 * The key an address is counted under: an IPv4 address as is, an IPv4-mapped
 * IPv6 address as the IPv4 address it carries, and any other IPv6 address as its
 * /64 prefix in one canonical spelling, so every notation of the same prefix
 * lands on the same count.
 */
function countedAs(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
  if (mapped) return mapped[1]
  if (!address.includes(":")) return address

  // "::" may appear once; a second one is not an address, so it is counted as sent.
  const [head, tail, ...rest] = address.split("::")
  if (rest.length > 0) return address
  const before = head ? head.split(":") : []
  const after = tail ? tail.split(":") : []
  // "::" stands for however many zero groups make eight.
  const elided = tail === undefined ? 0 : 8 - before.length - after.length
  const groups = [...before, ...Array<string>(Math.max(elided, 0)).fill("0"), ...after]
  if (groups.length !== 8 || !groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) return address

  // The first four groups are the /64 the subscriber holds; lowercase and drop leading zeros.
  return `${groups.slice(0, 4).map((group) => group.toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::/64`
}
