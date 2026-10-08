import { z } from "zod"

/** Response shapes from docs/api-1.yaml, as far as this adapter reads them. */

/**
 * The 201 body of POST /deregistration-applications and POST /registration-applications. The id is
 * a uuid in the spec, but only ever echoed back in later paths, so it is kept as an opaque non-empty string.
 */
export const createApplicationResponse = z.object({ applicationId: z.string().min(1) })

/**
 * The authority's i-Kfz availability. Closed, unlike `status` and `type` below: the spec defines
 * exactly these three and the poll schedule branches on them. A fourth value would fail the
 * parse instead of being guessed at.
 */
const ikfzStatus = z.enum(["online", "unavailable", "offline"])

/** GET /registration-authorities. A plate prefix can belong to several authorities, hence the array. */
export const registrationAuthoritiesResponse = z.object({
  registrationAuthorities: z.array(z.object({ kreiscode: z.string(), ikfzStatus })),
})

/**
 * int64 ids arrive as strings via the JSON reviver in `http.ts`. `type` stays a plain string
 * rather than the spec's enum: the gateway maps the types it knows and reads the rest as
 * `unknown`, so a document type added later cannot fail a status read.
 */
const document = z.object({ id: z.string(), type: z.string() })

/**
 * GET and PATCH on /deregistration-applications/{id} and /registration-applications/{id}, which
 * answer in the same four fields. The body also echoes what was filed: a de-registration's plate,
 * VIN and security codes, a Neuzulassung's owner, address, bank account, eVB number and Teil II
 * code. None of it is declared here, and `z.object` drops undeclared keys, so it never leaves this
 * parse.
 */
export const applicationResponse = z.object({
  applicationId: z.string(),
  /**
   * The spec's enum is IN_PROGRESS, FINISHED and ERROR, but it tells clients to expect statuses
   * they have not seen. So this stays a string: an unknown tag must read as in progress, not
   * fail the parse.
   */
  status: z.string(),
  /** Required by the spec; a missing list reads as no documents rather than failing the status read. */
  documents: z.array(document).default([]),
  /** Present on ERROR. Only `code` is guaranteed; the KBA's description and details are optional. */
  errorInfo: z
    .object({ code: z.number().int(), description: z.string().optional(), details: z.array(z.string()).optional() })
    .optional(),
})

/** The parsed shape, not the wire one: ids are strings and `documents` is always an array. */
export type ApplicationResponse = z.output<typeof applicationResponse>
