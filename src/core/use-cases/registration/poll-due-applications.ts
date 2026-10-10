import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { advanceStatus } from "./advance-status"

// Overlapping ticks are not exclusive: the version check stops double saves, not double vendor calls.
export async function pollDueApplications(
  deps: Dependencies,
  limit: number,
): Promise<{ checked: number; failed: number }> {
  const due = await deps.repository.findDueForPolling(deps.clock.now(), limit)
  // allSettled, not all: one order's failure must never stop the others in this tick.
  const results = await Promise.allSettled(due.map((application) => advanceStatus(deps, application)))

  let failed = 0
  results.forEach((result, index) => {
    if (result.status === "fulfilled") return
    failed += 1
    // Logged by error name only: the message may hold an address.
    const kind = result.reason instanceof Error ? result.reason.name : "unknown error"
    console.error(`[poll] ${due[index].reference} failed: ${kind}`)
  })
  return { checked: due.length, failed }
}
