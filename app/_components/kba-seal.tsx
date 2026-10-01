import Image from "next/image"

/**
 * The founder's KBA seal, shown unaltered: never round, tint or recolour it.
 * The file has a white background, so on white it disappears into the page
 * and on a dark surface it reads as a square white tile.
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
      src="/kba-zertifiziert.jpg"
      alt="ZulexGO ist KBA-zertifiziert: deutschlandweit digital zugelassen"
      width={1254}
      height={1254}
      sizes={sizes}
      className={className}
    />
  )
}
