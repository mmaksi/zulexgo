import { getContainer } from "@/src/config/container"
import { handleIdentityNotification } from "./handle"

export async function POST(request: Request) {
  return handleIdentityNotification(getContainer(), request)
}
