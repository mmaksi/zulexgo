"use server"

import { headers } from "next/headers"
import { heldInvite } from "@/app/(funnel)/invite-cookie"
import { getContainer } from "@/src/config/container"
import type { CheckoutActions } from "./_components/checkout-actions"
import { checkPrefix, startDeregistrationCheckout } from "./requests"

export const checkEligibilityAction: CheckoutActions["checkEligibility"] = async (prefix) =>
  checkPrefix(getContainer(), await headers(), prefix)

export const startCheckoutAction: CheckoutActions["startCheckout"] = async (input) =>
  startDeregistrationCheckout(getContainer(), await headers(), input, await heldInvite("deregistration"))
