import type { Application } from "@/src/core/domain/application/application"
import type { Money } from "@/src/core/domain/payment/money"
import { reasonFor } from "@/src/core/domain/registration/rejection-catalogue"
import type { Dependencies } from "@/src/core/use-cases/dependencies"

type LinkedEmail = "orderConfirmation" | "identityVerified" | "submittedToKba" | "completed" | "correctionRequired" | "rejected"

// Pass the application as about to be saved: the key counts its history, and 5b/5c read its failure.
export async function mailCustomer(
  deps: Pick<Dependencies, "repository" | "mailer" | "statusLink" | "errorCatalogue">,
  application: Application,
  name: LinkedEmail,
  extra: { refund?: Money; retained?: Money } = {},
): Promise<void> {
  const token = await deps.repository.getStatusToken(application.reference)
  if (!token) throw new Error(`Application ${application.reference} has no status token`)
  const { service } = application.request
  const common = { reference: application.reference, statusLink: deps.statusLink(token) }
  const reason = () => reasonFor(application.failure ?? { kind: "rejected" }, deps.errorCatalogue)

  const template =
    name === "submittedToKba"
      ? { name, service, ...common, manualProcessing: application.ikfzStatus !== "online" }
      : name === "rejected"
        ? { name, service, ...common, reason: reason(), refund: extra.refund!, retained: extra.retained! }
        : name === "correctionRequired"
          ? { name, service, ...common, reason: reason(), identityMismatch: application.failure?.kind === "identityMismatch" }
          : name === "identityVerified"
            ? { name, ...common }
            : { name, service, ...common }
  // The history length names the transition, so a repeat after a correction is still sent.
  const idempotencyKey = `${application.reference}/${name}/${application.history.length}`
  await deps.mailer.send({ to: application.email, template, idempotencyKey })
}

export async function mailRefund(deps: Pick<Dependencies, "mailer">, application: Application, amount: Money): Promise<void> {
  const { reference, email } = application
  await deps.mailer.send({ to: email, template: { name: "refundIssued", reference, amount }, idempotencyKey: `${reference}/refundIssued` })
}

export async function mailVerificationLink(
  deps: Pick<Dependencies, "mailer">,
  application: Application,
  name: "identityVerificationRequested" | "identityVerificationReminder",
  verificationLink: string,
): Promise<void> {
  const { reference, email, identityVerification } = application
  if (!identityVerification) throw new Error(`Application ${reference} has no identity verification`)
  const template = { name, reference, verificationLink, deadline: identityVerification.deadline }
  await deps.mailer.send({ to: email, template, idempotencyKey: `${reference}/${name}/${application.history.length}` })
}
