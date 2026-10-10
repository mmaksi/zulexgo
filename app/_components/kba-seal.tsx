import Image from "next/image"

// The KBA seal is shown unaltered, on white: never round, tint or recolour it
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
