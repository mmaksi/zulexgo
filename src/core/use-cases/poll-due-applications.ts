import type { Dependencies } from "./dependencies"
import { advanceStatus } from "./advance-status"

/**
 * The cron heartbeat: advance every application whose check is due. One
 * application failing never stops the others; it is retried on a later tick,
 * and named in the log by order and kind of error (the message may hold an
 * address), so a step that keeps failing shows up.
 *
 * Run by the poll route on its cron heartbeat, behind `CRON_SECRET`. `limit` caps how
 * many orders one tick takes, the soonest due first; the rest wait for the next tick.
 * The orders run side by side. Two ticks that overlap are safe rather than exclusive: the
 * version check on `update` lets only one of them save an order's next state
 * (`StaleApplication` for the other, whose step is redone on a later poll), and the steps repeat
 * harmlessly. Nothing stops two ticks from calling the vendors for one order at the same time
 * (docs/codebase-review-2026-10-02.md, gap 2). Returns how many
 * orders were taken and how many threw.
 */
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
    const kind = result.reason instanceof Error ? result.reason.name : "unknown error"
    console.error(`[poll] ${due[index].reference} failed: ${kind}`)
  })
  return { checked: due.length, failed }
}
