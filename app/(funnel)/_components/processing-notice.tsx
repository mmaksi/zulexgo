import type { IkfzStatus } from "@/src/core/domain/registration/registration-authority"
import { Alert } from "@/src/ui/alert"

/** site-contract §2.2: the processing-time expectation, set before payment. Each funnel words it for its own service. */
export function ProcessingNotice({ ikfzStatus, notices }: { ikfzStatus: IkfzStatus; notices: Record<IkfzStatus, string> }) {
  const manual = ikfzStatus !== "online"
  return (
    <Alert variant={manual ? "warning" : "info"} className="measure">
      {notices[ikfzStatus]}
    </Alert>
  )
}
