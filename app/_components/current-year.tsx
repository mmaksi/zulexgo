"use client"

// The footer is prerendered: a server-side year would freeze at build time
export function CurrentYear() {
  return <span suppressHydrationWarning>{new Date().getFullYear()}</span>
}
