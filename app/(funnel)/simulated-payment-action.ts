"use server"

import { getContainer } from "@/src/config/container"
import { parseApplicationReference } from "@/src/core/domain/application/application-reference"
import { confirmPayment } from "@/src/core/use-cases/payment/confirm-payment"
import { failedBecause } from "./failed-because"

export async function completeSimulatedPaymentAction(reference: string): Promise<{ ok: boolean }> {
  const container = getContainer()
  if (!container.simulateCustomerPayment) return { ok: false }
  try {
    const application = await container.repository.get(parseApplicationReference(reference))
    if (!application) return { ok: false }
    await container.simulateCustomerPayment(application.payment.id)
    await confirmPayment(container, application.reference)
    return { ok: true }
  } catch (error) {
    failedBecause("simulated payment", error)
    return { ok: false }
  }
}
