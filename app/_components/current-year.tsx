"use client"

/**
 * The footer is prerendered, so a server-side `new Date()` would freeze the
 * year at build time. The browser corrects it on hydration.
 */
export function CurrentYear() {
  return <span suppressHydrationWarning>{new Date().getFullYear()}</span>
}
