"use server"

import { headers } from "next/headers"
import { after } from "next/server"
import { getContainer } from "@/src/config/container"
import { requestStatusLink } from "./request"
import type { ResendFormState } from "./resend-form-state"

export async function requestStatusLinkAction(input: { reference: string; email: string }): Promise<ResendFormState> {
  return requestStatusLink(getContainer(), await headers(), input, after)
}
