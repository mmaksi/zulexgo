"use client"

import { TaskLayout } from "@/app/_components/task-layout"
import { Button } from "@/src/ui/button"

/** Any unexpected error below the root layout. The message stays generic: an error may carry data a customer entered. */
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <TaskLayout>
      <div className="flex flex-col gap-(--heading-space-below)">
        <h1 className="text-grau-dark">Etwas ist schiefgelaufen</h1>
        <p className="measure text-body text-grau">
          Bitte versuchen Sie es gleich noch einmal. Wenn der Fehler bleibt, schreiben Sie uns an kontakt@gm-gastro.com.
        </p>
        <div>
          <Button onClick={() => retry()}>Erneut versuchen</Button>
        </div>
      </div>
    </TaskLayout>
  )
}
