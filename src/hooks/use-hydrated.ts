import { useSyncExternalStore } from "react"

const noSubscription = () => () => undefined

/**
 * False in the server's HTML and until the page has hydrated, true after. A form's submit button stays
 * off until then: the browser's own submit would send every field as a query string (into the address
 * bar, the history and the server's logs), and where the script is blocked or fails it stays off for good.
 */
export function useHydrated() {
  return useSyncExternalStore(noSubscription, () => true, () => false)
}
