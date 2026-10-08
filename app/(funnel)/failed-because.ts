/**
 * A funnel's server actions are reachable by any POST and receive security codes and personal
 * details, so a failure is logged by the error's name only, never its message or the input.
 */
export const failedBecause = (action: string, error: unknown) => {
  console.error(`[funnel] ${action} failed: ${error instanceof Error ? error.name : "unknown error"}`)
}
