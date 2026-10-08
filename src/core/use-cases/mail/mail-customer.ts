import type { Application } from "@/src/core/domain/application/application"
import type { Money } from "@/src/core/domain/payment/money"
import { reasonFor } from "@/src/core/domain/registration/rejection-catalogue"
import type { Dependencies } from "@/src/core/use-cases/dependencies"

/**
 * The customer emails that carry the status link, by the business-logic numbering: 1 order
 * confirmation, 3 identity verified, 4 submitted to the KBA, 5a completed, 5b correction required,
 * 5c rejected. Email 6 (refund) carries no link, the resent link is mailed with a token not stored
 * yet (`resendStatusLink`), and email 2 and its reminder carry the verification link instead
 * (`mailVerificationLink`), so none of those goes through `mailCustomer`.
 */
type LinkedEmail = "orderConfirmation" | "identityVerified" | "submittedToKba" | "completed" | "correctionRequired" | "rejected"

/**
 * Sends one of the emails that carry the status link, built from the application's current token.
 *
 * Pass the application as it is about to be saved, not as it was read: the key below counts
 * the history, and emails 5b and 5c read the stored failure for the reason shown. Callers
 * send before they save the new status (the mailer never fails silently), so a send that
 * throws leaves the application at its old status, which the poller backs off (`advanceStatus`)
 * before a later poll sends it; only the repeat of email 4 after a correction does it the other
 * way round. `refund` and `retained` are required for
 * `rejected` and ignored by the others. Throws if the order has no status token, which is
 * issued when payment is confirmed.
 */
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
  // The history length names the transition, so an email repeated by a later transition (a correction back at the KBA) is still sent.
  const idempotencyKey = `${application.reference}/${name}/${application.history.length}`
  await deps.mailer.send({ to: application.email, template, idempotencyKey })
}

/**
 * Email 6. One per order however it is reached: the answer to a refund and the provider's
 * confirmation of it share a key. It carries no status link, so it needs no token.
 */
export async function mailRefund(deps: Pick<Dependencies, "mailer">, application: Application, amount: Money): Promise<void> {
  const { reference, email } = application
  await deps.mailer.send({ to: email, template: { name: "refundIssued", reference, amount }, idempotencyKey: `${reference}/refundIssued` })
}

/**
 * Email 2, and its reminder: send the customer to verify their identity before `deadline`. Pass the order as it is
 * about to be saved, with its verification in place: the key counts the history, so a retried send is delivered once.
 * The link is the provider's own, which is not kept: `start` returns the same one for an order already started.
 */
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
