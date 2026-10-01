import Image from "next/image"

/**
 * The founder's KBA seal, shown unaltered: never round, tint or recolour it.
 * The file has a transparent background and dark lettering, so it belongs on
 * a white surface: the page itself, or a white tile on a dark one.
 */
export function KbaSeal({
  sizes,
  className,
}: {
  sizes: string
  className?: string
}) {
  return (
    <Image
      src="/kba-zertifiziert.png"
      alt="ZulexGO ist KBA-zertifiziert: deutschlandweit digital zugelassen"
      width={1254}
      height={1254}
      sizes={sizes}
      className={className}
    />
  )
}
