import { cn } from "cn"

/**
 * design-standard.md §3.4 — Kanit SemiBold Italic, tracking -0.02em, the
 * two-tone split is mandatory in every variant. Never re-colour or rotate.
 * On dark surfaces the orange half becomes orange-bright (8.01:1 on grau-dark).
 *
 * The halves are decorative: the lockup carries one accessible name so it
 * announces as a single logotype rather than two text runs.
 */
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
