/** site-contract §3: neutral, the same for every invalid link, disclosing nothing. */
export default function StatusLinkNotFound() {
  return (
    <div className="flex flex-col gap-(--heading-space-below)">
      <h1 className="text-grau-dark">Link nicht gültig</h1>
      <p className="measure text-body text-grau">
        Dieser Statuslink ist nicht gültig. Bitte öffnen Sie den Link aus Ihrer neuesten E-Mail von ZulexGO. Wenn Sie
        ihn nicht mehr finden, schreiben Sie uns an kontakt@gm-gastro.com und nennen Sie Ihre Auftragsnummer.
      </p>
    </div>
  )
}
