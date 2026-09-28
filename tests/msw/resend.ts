import { http, HttpResponse } from "msw"

export const RESEND_TEST_API_KEY = "re_fake_zulexgo"

interface SentEmail {
  from: string
  to: string[]
  subject: string
  html: string
  text: string
  idempotencyKey: string | null
}

/**
 * Resend's POST /emails at the network boundary. Like Resend, a repeated
 * Idempotency-Key is answered with the first response and delivers nothing.
 */
export class ResendDouble {
  readonly delivered: SentEmail[] = []
  private readonly keys = new Map<string, string>()
  private failure?: Response

  failNext(response: Response) {
    this.failure = response
  }

  readonly handlers = [
    http.post("https://api.resend.com/emails", async ({ request }) => {
      if (request.headers.get("Authorization") !== `Bearer ${RESEND_TEST_API_KEY}`) {
        return HttpResponse.json({ statusCode: 401, name: "validation_error", message: "API key is invalid" }, { status: 401 })
      }
      if (this.failure) {
        const failure = this.failure
        this.failure = undefined
        return failure
      }
      const idempotencyKey = request.headers.get("Idempotency-Key")
      const earlier = idempotencyKey ? this.keys.get(idempotencyKey) : undefined
      if (earlier) return HttpResponse.json({ id: earlier })

      const body = (await request.json()) as Omit<SentEmail, "idempotencyKey">
      const id = `fake-email-${this.delivered.length + 1}`
      this.delivered.push({ ...body, idempotencyKey })
      if (idempotencyKey) this.keys.set(idempotencyKey, id)
      return HttpResponse.json({ id })
    }),
  ]
}
