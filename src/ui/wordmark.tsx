import { cn } from "@/src/lib/utils"

const TONES = {
  light: { name: "text-grau", suffix: "text-orange" },
  dark: { name: "text-white", suffix: "text-orange-bright" },
} as const

export function Wordmark({
  tone = "light",
  className,
}: {
  tone?: keyof typeof TONES
  className?: string
}) {
  const { name, suffix } = TONES[tone]

  return (
    <span
      role="img"
      aria-label="ZulexGO"
      className={cn(
        "font-wordmark text-[22px] leading-none font-semibold italic tracking-[-0.02em] sm:text-[26px]",
        className
      )}
    >
      <span aria-hidden="true" className={name}>
        ZULEX
      </span>
      <span aria-hidden="true" className={suffix}>
        GO
      </span>
    </span>
  )
}
