"use server"

import { headers } from "next/headers"
import { heldInvite } from "@/app/(funnel)/invite-cookie"
import { getContainer } from "@/src/config/container"
import type { RegistrationActions } from "./_components/registration-actions"
import { checkPostcode, startRegistrationCheckout } from "./requests"

export const checkEligibilityAction: RegistrationActions["checkEligibility"] = async (postcode) =>
  checkPostcode(getContainer(), await headers(), postcode)

export const startCheckoutAction: RegistrationActions["startCheckout"] = async (input) =>
  startRegistrationCheckout(getContainer(), await headers(), input, await heldInvite("newRegistration"))
