import type { Metadata } from "next"
import Link from "next/link"
import { TaskLayout } from "@/app/_components/task-layout"
import { buttonLink } from "@/src/ui/button"

export const metadata: Metadata = { title: "Seite nicht gefunden — ZulexGO" }

export default function NotFound() {
  return (
    <TaskLayout>
      <div className="flex flex-col gap-(--heading-space-below)">
        <h1 className="text-grau-dark">Seite nicht gefunden</h1>
        <p className="measure text-body text-grau">
          Diese Seite gibt es nicht. Vielleicht ist der Link veraltet oder nicht ganz vollständig.
        </p>
        <div>
          <Link href="/" className={buttonLink()}>
            Zur Startseite
          </Link>
        </div>
      </div>
    </TaskLayout>
  )
}
