"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

const REFRESH_EVERY_MS = 30_000

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
