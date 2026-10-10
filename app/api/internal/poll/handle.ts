import { hasBearer } from "@/app/api/internal/bearer"

const BATCH = 50

export async function handlePoll(
  deps: { cronSecret: string | undefined; poll: (limit: number) => Promise<{ checked: number; failed: number }> },
  request: Request,
): Promise<Response> {
  if (!hasBearer(request, deps.cronSecret)) return new Response(null, { status: 401 })
  return Response.json(await deps.poll(BATCH))
}
