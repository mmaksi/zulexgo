/** design-standard §7: where on the document a value is found. A placeholder until the photos exist (launch plan M7). `what` finishes "wo … steht". */
export function LocatorPhoto({ what = "der Code" }: { what?: string }) {
  return (
    <div aria-hidden="true" className="flex h-16 max-w-60 items-center justify-center rounded-sm bg-bg-blue text-small text-grau-bright">
      Foto: wo {what} steht
    </div>
  )
}
