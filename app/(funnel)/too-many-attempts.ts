export const tooManyAttempts = (retryAfterMinutes: number) =>
  `Zu viele Versuche. Bitte warten Sie ${retryAfterMinutes} ${retryAfterMinutes === 1 ? "Minute" : "Minuten"} und versuchen Sie es dann erneut.`
