import type { Dependencies } from "./dependencies"
import { advanceStatus } from "./advance-status"

/**
 * The cron heartbeat: advance every application whose check is due. One
 * application failing never stops the others; it is retried on a later tick,
 * and named in the log by order and kind of error (the message may hold an
 * address), so a step that keeps failing shows up.
 */
export async function pollDueApplications(
  deps: Dependencies,
  limit: number,
): Promise<{ checked: number; failed: number }> {
  const due = await deps.repository.findDueForPolling(deps.clock.now(), limit)
  const results = await Promise.allSettled(due.map((application) => advanceStatus(deps, application)))

  let failed = 0
  results.forEach((result, index) => {
    if (result.status === "fulfilled") return
    failed += 1
    const kind = result.reason instanceof Error ? result.reason.name : "unknown error"
    console.error(`[poll] ${due[index].reference} failed: ${kind}`)
  })
  return { checked: due.length, failed }
}
