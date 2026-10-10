import { useSyncExternalStore } from "react"

const noSubscription = () => () => undefined

// Gate submits on this: before hydration the browser's own submit puts every field in the URL.
export function useHydrated() {
  return useSyncExternalStore(noSubscription, () => true, () => false)
}
