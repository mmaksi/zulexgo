import { cn } from "@/src/lib/utils"

/**
 * design-standard.md §5.1 — the brand's only graphic device. Full bleed, thick
 * left to thin right, flat orange, never mirrored or stacked. Decoration only:
 * at most one section wedge per viewport height, plus the page terminator.
 * The geometry itself lives in globals.css.
 */
export function Wedge({
  variant = "section",
  tone,
  className,
}: {
  variant?: "section" | "page"
  tone?: "grau"
  className?: string
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "wedge",
        variant === "page" ? "wedge--page" : "wedge--section",
        tone === "grau" && "wedge--grau",
        className
      )}
    />
  )
}
