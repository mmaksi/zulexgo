/** site-contract §2.5: the order ID, and where the status link went. */
export function Confirmation({ reference, email }: { reference: string; email?: string }) {
  return (
    <div className="flex flex-col gap-(--heading-space-below)">
      <p className="measure text-subtitle text-grau">
        Ihre Auftragsnummer lautet <strong className="font-normal text-grau-dark">{reference}</strong>.
      </p>
      <p className="measure text-body text-grau">
        Ihr persönlicher Statuslink ist unterwegs {email ? <>an <span className="text-grau-dark">{email}</span></> : "an Ihre E-Mail-Adresse"}.
        Darüber sehen Sie jederzeit, wie weit Ihre Abmeldung ist, und wir schreiben Ihnen bei jeder Neuigkeit.
      </p>
    </div>
  )
}
