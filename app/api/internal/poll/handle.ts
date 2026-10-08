import { hasBearer } from "@/app/api/internal/bearer"

const BATCH = 50

/**
 * The poller's heartbeat, meant for a scheduler presenting CRON_SECRET as a
 * bearer token. No schedule calls it yet: the Zulex API it polls is down.
 * Without a configured secret it refuses everyone.
 */
export async function handlePoll(
  deps: { cronSecret: string | undefined; poll: (limit: number) => Promise<{ checked: number; failed: number }> },
  request: Request,
): Promise<Response> {
  if (!hasBearer(request, deps.cronSecret)) return new Response(null, { status: 401 })
  return Response.json(await deps.poll(BATCH))
}
