import { VERIFICATION_DEADLINE_AFTER_MS } from "@/src/core/domain/payment/verification-policy"

const DAY_MS = 24 * 60 * 60 * 1000

export function Confirmation({ reference, email }: { reference: string; email?: string }) {
  return (
    <div className="flex flex-col gap-(--heading-space-below)">
      <p className="measure text-subtitle text-grau">
        Ihre Auftragsnummer lautet <strong className="font-normal text-grau-dark">{reference}</strong>.
      </p>
      <p className="measure text-body text-grau">
        Ihr persönlicher Statuslink ist unterwegs {email ? <>an <span className="text-grau-dark">{email}</span></> : "an Ihre E-Mail-Adresse"}.
        Darüber sehen Sie jederzeit, wie weit Ihre Zulassung ist, und wir schreiben Ihnen bei jeder Neuigkeit.
      </p>
      <p className="measure text-body text-grau">
        Als Nächstes schicken wir Ihnen eine zweite E-Mail mit dem Link zur Identitätsprüfung. Erst wenn Sie sich ausgewiesen haben, reichen wir
        Ihren Antrag ein. Bitte erledigen Sie das in den nächsten {VERIFICATION_DEADLINE_AFTER_MS / DAY_MS} Tagen, sonst stornieren wir den
        Antrag und geben Ihr Geld frei.
      </p>
    </div>
  )
}
