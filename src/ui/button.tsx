import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/src/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-small font-normal tracking-widest whitespace-nowrap uppercase transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-orange-dark active:bg-orange-pressed",
        outline:
          "border-grau text-grau-dark bg-transparent hover:border-grau-dark hover:bg-bg-blue active:bg-bg-blue-pressed",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-bg-blue-pressed active:bg-bg-blue-pressed",
        ghost: "text-grau-dark hover:bg-bg-blue active:bg-bg-blue-pressed",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "text-grau-dark underline-offset-4 hover:text-orange-dark hover:underline active:text-grau-dark",
      },
      size: {
        default: "h-12 gap-2 px-6",
        sm: "h-11 gap-1.5 px-4",
        lg: "h-12 gap-2 px-8",
        icon: "size-12 rounded-sm",
        "icon-sm": "size-11 rounded-sm",
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

// Links stay anchors: Base UI's button would strip their link semantics and warn about nativeButton.
function buttonLink({
  className,
  ...variants
}: VariantProps<typeof buttonVariants> & { className?: string } = {}) {
  return cn(buttonVariants(variants), className)
}

export { Button, buttonLink, buttonVariants }
