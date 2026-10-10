// The first x-forwarded-for entry is trusted because Vercel sets it; elsewhere the caller can forge it.
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return countedAs(forwarded || headers.get("x-real-ip")?.trim() || "unknown")
}

// IPv6 counts by its /64: one subscriber can pick any address in it to get a fresh count.
function countedAs(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
  if (mapped) return mapped[1]
  if (!address.includes(":")) return address

  const [head, tail, ...rest] = address.split("::")
  if (rest.length > 0) return address
  const before = head ? head.split(":") : []
  const after = tail ? tail.split(":") : []
  const elided = tail === undefined ? 0 : 8 - before.length - after.length
  const groups = [...before, ...Array<string>(Math.max(elided, 0)).fill("0"), ...after]
  if (groups.length !== 8 || !groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) return address

  return `${groups.slice(0, 4).map((group) => group.toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::/64`
}
