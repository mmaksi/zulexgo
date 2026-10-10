import { cn } from "@/src/lib/utils"

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
