import { z } from "zod"

export const createApplicationResponse = z.object({ applicationId: z.string().min(1) })

const ikfzStatus = z.enum(["online", "unavailable", "offline"])

export const registrationAuthoritiesResponse = z.object({
  registrationAuthorities: z.array(z.object({ kreiscode: z.string(), ikfzStatus })),
})

// ids are int64 strings from http.ts's reviver; type stays open so a new document type can't fail a read.
const document = z.object({ id: z.string(), type: z.string() })

// The body echoes the filed personal data; z.object drops undeclared keys, so it never leaves this parse.
export const applicationResponse = z.object({
  applicationId: z.string(),
  // Not an enum: the spec says to expect unseen statuses, which must read as in progress.
  status: z.string(),
  documents: z.array(document).default([]),
  errorInfo: z
    .object({ code: z.number().int(), description: z.string().optional(), details: z.array(z.string()).optional() })
    .optional(),
})

export type ApplicationResponse = z.output<typeof applicationResponse>
