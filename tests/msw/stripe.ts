import { createHmac } from "node:crypto"
import { http, HttpResponse, type JsonBodyType } from "msw"

export const STRIPE_TEST_SECRET_KEY = "sk_test_fake_zulexgo"
export const STRIPE_TEST_WEBHOOK_SECRET = "whsec_fake_zulexgo"
const API = "https://api.stripe.com/v1"
const HOLD_VALIDITY_S = 7 * 24 * 60 * 60

type IntentStatus = "requires_payment_method" | "requires_capture" | "succeeded" | "canceled"

interface Intent {
  id: string
  amount: number
  amount_capturable: number
  amount_received: number
  capture_method: string
  payment_method_types: string[]
  metadata: Record<string, string>
  status: IntentStatus
  chargeId?: string
}

interface Charge {
  id: string
  amount: number
  amount_captured: number
  amount_refunded: number
  captured: boolean
  payment_intent: string
  capture_before?: number
}

interface Refund {
  id: string
  amount: number
  payment_intent: string
  charge: string
  metadata: Record<string, string>
}

/** Stripe's form encoding (`metadata[order_id]=…`, `payment_method_types[0]=card`) read back into an object. */
function readForm(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of new URLSearchParams(text)) {
    const [head, ...rest] = key.split("[").map((part) => part.replace("]", ""))
    if (rest.length === 0) result[head] = value
    else if (/^\d+$/.test(rest[0])) ((result[head] ??= []) as unknown[]).push(value)
    else ((result[head] ??= {}) as Record<string, unknown>)[rest[0]] = value
  }
  return result
}

const stripeError = (message: string, code: string) =>
  HttpResponse.json({ error: { type: "invalid_request_error", code, message } }, { status: 400 })

/**
 * Stripe's API at the network boundary, holding PaymentIntents, Charges and
 * Refunds in memory with the fields and state changes of the real objects
 * (API version 2026-08-26.dahlia). Honours Idempotency-Key on POST, as Stripe
 * does. `customerPays` and `event` stand in for the browser and for Stripe's
 * webhook delivery.
 */
export class StripeDouble {
  /** Every form body POSTed, as sent. */
  readonly sent: string[] = []
  readonly intents = new Map<string, Intent>()
  private readonly charges = new Map<string, Charge>()
  private readonly refunds: Refund[] = []
  private readonly idempotent = new Map<string, JsonBodyType>()
  private sequence = 0

  /** card: authorised and held. sepaDebit: taken at once, as a method that cannot be held. */
  customerPays(intentId: string, method: "card" | "sepaDebit") {
    const intent = this.find(intentId)
    const charge: Charge = {
      id: this.id("ch"),
      amount: intent.amount,
      amount_captured: method === "card" ? 0 : intent.amount,
      amount_refunded: 0,
      captured: method !== "card",
      payment_intent: intent.id,
      capture_before: method === "card" ? Math.floor(Date.now() / 1000) + HOLD_VALIDITY_S : undefined,
    }
    this.charges.set(charge.id, charge)
    Object.assign(intent, {
      chargeId: charge.id,
      status: method === "card" ? "requires_capture" : "succeeded",
      amount_capturable: method === "card" ? intent.amount : 0,
      amount_received: method === "card" ? 0 : intent.amount,
    })
  }

  /** A webhook delivery: the event body and the Stripe-Signature header for it. */
  event(type: string, intentId: string, secret = STRIPE_TEST_WEBHOOK_SECRET) {
    const payload = JSON.stringify({
      id: this.id("evt"),
      object: "event",
      api_version: "2026-08-26.dahlia",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      type,
      data: { object: this.intentJson(this.find(intentId)) },
    })
    const timestamp = Math.floor(Date.now() / 1000)
    const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")
    return { payload, signature: `t=${timestamp},v1=${signature}` }
  }

  readonly handlers = [
    http.post(`${API}/payment_intents`, async ({ request }) =>
      this.once(request, async (form) => {
        const intent: Intent = {
          id: this.id("pi"),
          amount: Number(form.amount),
          amount_capturable: 0,
          amount_received: 0,
          capture_method: String(form.capture_method ?? "automatic"),
          payment_method_types: (form.payment_method_types as string[]) ?? ["card"],
          metadata: (form.metadata as Record<string, string>) ?? {},
          status: "requires_payment_method",
        }
        this.intents.set(intent.id, intent)
        return this.intentJson(intent)
      }),
    ),

    http.get(`${API}/payment_intents/:id`, ({ params, request }) => {
      const intent = this.intents.get(String(params.id))
      if (!intent) return stripeError("No such payment_intent", "resource_missing")
      const expand = new URL(request.url).searchParams.getAll("expand[0]").concat(new URL(request.url).searchParams.getAll("expand[]"))
      return HttpResponse.json(this.intentJson(intent, expand.includes("latest_charge")))
    }),

    http.post(`${API}/payment_intents/:id/capture`, async ({ params, request }) =>
      this.once(request, async (form) => {
        const intent = this.find(String(params.id))
        if (intent.status !== "requires_capture") {
          return stripeError(`This PaymentIntent could not be captured because it has a status of ${intent.status}.`, "payment_intent_unexpected_state")
        }
        const amount = form.amount_to_capture ? Number(form.amount_to_capture) : intent.amount
        const charge = this.charges.get(intent.chargeId!)!
        Object.assign(charge, { amount_captured: amount, captured: true, capture_before: undefined })
        Object.assign(intent, { status: "succeeded", amount_received: amount, amount_capturable: 0 })
        return this.intentJson(intent)
      }),
    ),

    http.post(`${API}/payment_intents/:id/cancel`, async ({ params, request }) =>
      this.once(request, async () => {
        const intent = this.find(String(params.id))
        if (intent.status === "succeeded") {
          return stripeError("You cannot cancel this PaymentIntent because it has a status of succeeded.", "payment_intent_unexpected_state")
        }
        Object.assign(intent, { status: "canceled", amount_capturable: 0 })
        return this.intentJson(intent)
      }),
    ),

    http.post(`${API}/refunds`, async ({ request }) =>
      this.once(request, async (form) => {
        const intent = this.find(String(form.payment_intent))
        const charge = intent.chargeId ? this.charges.get(intent.chargeId) : undefined
        if (!charge?.captured) return stripeError("This PaymentIntent has no captured charge to refund.", "charge_not_refundable")
        const amount = form.amount ? Number(form.amount) : charge.amount_captured - charge.amount_refunded
        if (amount > charge.amount_captured - charge.amount_refunded) {
          return stripeError("Refund amount is greater than unrefunded amount on charge.", "amount_too_large")
        }
        charge.amount_refunded += amount
        const refund: Refund = {
          id: this.id("re"),
          amount,
          payment_intent: intent.id,
          charge: charge.id,
          metadata: (form.metadata as Record<string, string>) ?? {},
        }
        this.refunds.push(refund)
        return { object: "refund", status: "succeeded", currency: "eur", ...refund }
      }),
    ),

    http.get(`${API}/refunds`, ({ request }) => {
      const intentId = new URL(request.url).searchParams.get("payment_intent")
      const data = this.refunds
        .filter((refund) => refund.payment_intent === intentId)
        .map((refund) => ({ object: "refund", status: "succeeded", currency: "eur", ...refund }))
      return HttpResponse.json({ object: "list", data, has_more: false, url: "/v1/refunds" })
    }),
  ]

  private async once(request: Request, handle: (form: Record<string, unknown>) => Promise<JsonBodyType | Response>) {
    if (request.headers.get("Authorization") !== `Bearer ${STRIPE_TEST_SECRET_KEY}`) {
      return HttpResponse.json({ error: { type: "invalid_request_error", message: "Invalid API Key provided" } }, { status: 401 })
    }
    const key = request.headers.get("Idempotency-Key")
    if (key && this.idempotent.has(key)) return HttpResponse.json(this.idempotent.get(key))

    const body = await request.text()
    this.sent.push(body)
    const result = await handle(readForm(body))
    if (result instanceof Response) return result
    if (key) this.idempotent.set(key, result)
    return HttpResponse.json(result)
  }

  private intentJson(intent: Intent, expandCharge = false) {
    const charge = intent.chargeId ? this.charges.get(intent.chargeId) : undefined
    return {
      id: intent.id,
      object: "payment_intent",
      amount: intent.amount,
      amount_capturable: intent.amount_capturable,
      amount_received: intent.amount_received,
      capture_method: intent.capture_method,
      client_secret: `${intent.id}_secret_fake`,
      currency: "eur",
      livemode: false,
      metadata: intent.metadata,
      payment_method_types: intent.payment_method_types,
      status: intent.status,
      latest_charge: charge ? (expandCharge ? this.chargeJson(charge) : charge.id) : null,
    }
  }

  private chargeJson(charge: Charge) {
    return {
      id: charge.id,
      object: "charge",
      amount: charge.amount,
      amount_captured: charge.amount_captured,
      amount_refunded: charge.amount_refunded,
      captured: charge.captured,
      currency: "eur",
      payment_intent: charge.payment_intent,
      refunded: charge.amount_refunded === charge.amount_captured && charge.captured,
      status: "succeeded",
      payment_method_details: {
        type: "card",
        card: { brand: "visa", last4: "4242", ...(charge.capture_before ? { capture_before: charge.capture_before } : {}) },
      },
    }
  }

  private find(intentId: string): Intent {
    const intent = this.intents.get(intentId)
    if (!intent) throw new Error(`StripeDouble: unknown PaymentIntent ${intentId}`)
    return intent
  }

  private id(prefix: string) {
    this.sequence += 1
    return `${prefix}_fake${String(this.sequence).padStart(8, "0")}`
  }
}
