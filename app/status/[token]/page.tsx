import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { StatusRefresh } from "@/app/status/[token]/_components/status-refresh"
import { StatusView } from "@/app/status/[token]/_components/status-view"
import { TooManyLookups } from "@/app/status/[token]/_components/too-many-lookups"
import { cancelOrderAction, correctOrderAction } from "@/app/status/[token]/actions"
import { lookupStatus } from "@/app/status/[token]/lookup"
import { getContainer } from "@/src/config/container"

export const metadata: Metadata = { title: "Ihr Antrag — ZulexGO", robots: { index: false, follow: false } }

export default async function StatusPage({ params }: PageProps<"/status/[token]">) {
  const { token } = await params
  const lookup = await lookupStatus(getContainer(), await headers(), token)

  // Every invalid link gets the same page: nothing says whether one ever existed.
  if (lookup.kind === "invalid") notFound()
  if (lookup.kind === "limited") {
    // Keep asking: the page appears by itself once the caller is under the limit again.
    return (
      <>
        <TooManyLookups retryAfterSeconds={lookup.retryAfterSeconds} />
        <StatusRefresh active />
      </>
    )
  }

  const { view } = lookup
  const inProgress = view.steps.some((step) => step.id === "outcome" && step.state === "pending")
  return (
    <>
      <StatusView
        view={view}
        documentHref={(documentId) => `/status/${encodeURIComponent(token)}/documents/${documentId}`}
        cancelAction={cancelOrderAction.bind(null, token)}
        correctAction={correctOrderAction.bind(null, token)}
      />
      <StatusRefresh active={inProgress} />
    </>
  )
}
