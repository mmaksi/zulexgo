import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { StatusView } from "@/app/status/[token]/_components/status-view"
import { getContainer } from "@/src/config/container"
import { TokenInvalid } from "@/src/core/errors/token-invalid"
import { getStatusByToken } from "@/src/core/use-cases/get-status-by-token"

export const metadata: Metadata = { title: "Ihr Antrag — ZulexGO", robots: { index: false, follow: false } }

export default async function StatusPage({ params }: PageProps<"/status/[token]">) {
  const { token } = await params
  const view = await getStatusByToken(getContainer(), token).catch((error) => {
    if (error instanceof TokenInvalid) return undefined
    throw error
  })
  // Every invalid link gets the same page: nothing says whether one ever existed.
  if (!view) notFound()
  return <StatusView view={view} />
}
