/** What the customer is told when an address is over a funnel's limit, as the status page words its own. */
export const tooManyAttempts = (retryAfterMinutes: number) =>
  `Zu viele Versuche. Bitte warten Sie ${retryAfterMinutes} ${retryAfterMinutes === 1 ? "Minute" : "Minuten"} und versuchen Sie es dann erneut.`
