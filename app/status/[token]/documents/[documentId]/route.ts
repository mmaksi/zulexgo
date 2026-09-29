import { getContainer } from "@/src/config/container"
import { handleDocumentDownload } from "./handle"

export async function GET(request: Request, { params }: RouteContext<"/status/[token]/documents/[documentId]">) {
  return handleDocumentDownload(getContainer(), request, await params)
}
