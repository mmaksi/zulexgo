import { getContainer } from "@/src/config/container"
import { pollDueApplications } from "@/src/core/use-cases/registration/poll-due-applications"
import { handlePoll } from "./handle"

export async function GET(request: Request) {
  const container = getContainer()
  return handlePoll({ cronSecret: container.env.CRON_SECRET, poll: (limit) => pollDueApplications(container, limit) }, request)
}
