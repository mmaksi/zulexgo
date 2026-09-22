import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// design-standard.md §4.4/§6.3 — radius-md, 48px min target, colour-only state
// changes (no lift, no scale), focus ring grau-dark and never orange.
// §5.5 sets 20px for an icon in a button; Shadcn's default is 16px.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-xs font-semibold tracking-widest whitespace-nowrap uppercase transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        // §2.3 rule 1 — grau-dark on orange (6.40:1), never white.
        default:
          "bg-primary text-primary-foreground hover:bg-orange-dark active:bg-orange-pressed",
        outline:
          "border-grau text-grau-dark bg-transparent hover:border-grau-dark hover:bg-bg-blue active:bg-bg-blue-pressed",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-bg-blue-pressed active:bg-bg-blue-pressed",
        ghost: "text-grau-dark hover:bg-bg-blue active:bg-bg-blue-pressed",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "text-grau-dark underline underline-offset-4 hover:text-orange-dark",
      },
      size: {
        default: "h-12 gap-2 px-6",
        sm: "h-10 gap-1.5 px-4",
        lg: "h-12 gap-2 px-8",
        icon: "size-12",
        "icon-sm": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

/**
 * Classes for an anchor that should look like a button. Navigation is a link,
 * not an action, so it is styled rather than pushed through Base UI's button
 * (which would strip link semantics and warn about `nativeButton`).
 *
 * This merges, where raw `buttonVariants()` does not: the base sets
 * `border-transparent` and the outline variant sets `border-grau`, so without
 * tailwind-merge the border silently disappears.
 */
function buttonLink({
  className,
  ...variants
}: VariantProps<typeof buttonVariants> & { className?: string } = {}) {
  return cn(buttonVariants(variants), className)
}

export { Button, buttonLink, buttonVariants }
