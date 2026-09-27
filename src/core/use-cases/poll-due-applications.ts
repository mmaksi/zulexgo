import type { Dependencies } from "./dependencies"
import { advanceStatus } from "./advance-status"

/**
 * The cron heartbeat: advance every application whose check is due. One
 * application failing never stops the others; it is retried on a later tick.
 */
export async function pollDueApplications(
  deps: Dependencies,
  limit: number,
): Promise<{ checked: number; failed: number }> {
  const due = await deps.repository.findDueForPolling(deps.clock.now(), limit)
  const results = await Promise.allSettled(due.map((application) => advanceStatus(deps, application)))
  return { checked: due.length, failed: results.filter((result) => result.status === "rejected").length }
}
