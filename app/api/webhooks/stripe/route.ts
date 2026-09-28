import { getContainer } from "@/src/config/container"
import { handlePaymentNotification } from "./handle"

export async function POST(request: Request) {
  return handlePaymentNotification(getContainer(), request)
}
