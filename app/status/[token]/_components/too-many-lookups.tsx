export function TooManyLookups({ retryAfterSeconds }: { retryAfterSeconds: number }) {
  return (
    <div className="flex flex-col gap-(--heading-space-below)">
      <h1 className="text-grau-dark">Zu viele Anfragen</h1>
      <p className="measure text-body text-grau">
        Von Ihrem Anschluss kamen gerade sehr viele Anfragen. Bitte warten Sie {retryAfterSeconds} Sekunden und laden Sie die Seite dann neu.
      </p>
    </div>
  )
}
