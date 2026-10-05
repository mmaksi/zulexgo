"use server"

import { headers } from "next/headers"
import { getContainer } from "@/src/config/container"
import type { RegistrationActions } from "./_components/registration-actions"
import { checkPostcode, startRegistrationCheckout } from "./requests"

/** Reachable by any POST: `requests.ts` counts each call against the caller's address and validates what it receives. */

export const checkEligibilityAction: RegistrationActions["checkEligibility"] = async (postcode) =>
  checkPostcode(getContainer(), await headers(), postcode)

export const startCheckoutAction: RegistrationActions["startCheckout"] = async (input) =>
  startRegistrationCheckout(getContainer(), await headers(), input)
