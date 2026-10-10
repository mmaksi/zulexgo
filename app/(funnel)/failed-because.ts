// Name only: an action's input and error message can carry security codes and personal details
export const failedBecause = (action: string, error: unknown) => {
  console.error(`[funnel] ${action} failed: ${error instanceof Error ? error.name : "unknown error"}`)
}
