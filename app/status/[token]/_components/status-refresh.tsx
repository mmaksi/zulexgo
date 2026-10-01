"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

const REFRESH_EVERY_MS = 30_000

/**
 * Keeps an order in progress up to date without a manual reload: asks the
 * server again every half minute and whenever the customer comes back to the
 * tab. Once the order has an outcome nothing is left to wait for, so it stops.
 * It also brings the current step into view once, as the page opens.
 */
export function StatusRefresh({ active }: { active: boolean }) {
  const router = useRouter()

  useEffect(() => {
    if (!active) return
    const refresh = () => router.refresh()
    const timer = setInterval(refresh, REFRESH_EVERY_MS)
    window.addEventListener("focus", refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener("focus", refresh)
    }
  }, [active, router])

  useEffect(() => {
    document.querySelector('[aria-current="step"]')?.scrollIntoView?.({ block: "center" })
  }, [])

  return null
}
