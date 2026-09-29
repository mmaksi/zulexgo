import type { Application } from "@/src/core/domain/application"
import type { Money } from "@/src/core/domain/money"
import type { Dependencies } from "./dependencies"

type LinkedEmail = "orderConfirmation" | "submittedToKba" | "completed" | "correctionRequired" | "rejected"

/** Sends one of the emails that carry the status link, built from the application's current token. */
export async function mailCustomer(
  deps: Pick<Dependencies, "repository" | "mailer" | "statusLink">,
  application: Application,
  name: LinkedEmail,
  extra: { refund?: Money; retained?: Money } = {},
): Promise<void> {
  const token = await deps.repository.getStatusToken(application.reference)
  if (!token) throw new Error(`Application ${application.reference} has no status token`)
  const common = { reference: application.reference, statusLink: deps.statusLink(token) }

  const template =
    name === "submittedToKba"
      ? { name, ...common, manualProcessing: application.ikfzStatus !== "online" }
      : name === "rejected"
        ? { name, ...common, refund: extra.refund!, retained: extra.retained! }
        : { name, ...common }
  // The history length names the transition, so an email repeated by a later transition (a correction back at the KBA) is still sent.
  const idempotencyKey = `${application.reference}/${name}/${application.history.length}`
  await deps.mailer.send({ to: application.email, template, idempotencyKey })
}
