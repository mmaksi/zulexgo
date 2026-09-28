import { z } from "zod"

/** Response shapes from docs/api-1.yaml, as far as this adapter reads them. */

export const createApplicationResponse = z.object({ applicationId: z.string().min(1) })

const ikfzStatus = z.enum(["online", "unavailable", "offline"])

export const registrationAuthoritiesResponse = z.object({
  registrationAuthorities: z.array(z.object({ kreiscode: z.string(), ikfzStatus })),
})

/** int64 ids arrive as strings via the JSON reviver in `http.ts`; `type` stays open, since the spec says new values arrive. */
const document = z.object({ id: z.string(), type: z.string() })

export const deregistrationApplicationResponse = z.object({
  applicationId: z.string(),
  /** Open for the same reason: an unknown tag must read as in progress, not fail the parse. */
  status: z.string(),
  documents: z.array(document).default([]),
  errorInfo: z
    .object({ code: z.number().int(), description: z.string().optional(), details: z.array(z.string()).optional() })
    .optional(),
})

export type DeregistrationApplicationResponse = z.output<typeof deregistrationApplicationResponse>
