import { createCn } from "cn/config"

/**
 * The custom `@theme` tokens in app/globals.css, so merging treats them by kind.
 *
 * Shadcn's `cn` (the `cn` package, a drop-in for clsx plus tailwind-merge): joins
 * class values and lets the last conflicting Tailwind utility win, so a caller's
 * `className` can override a component's defaults. The engine knows none of this
 * app's type scale, elevations or easings. Without the registrations here it
 * reads `text-h4` as a colour, and a later `text-grau-dark` silently deletes the size.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [{ text: ["h1", "h2", "h3", "h4", "subtitle", "body", "small"] }],
      shadow: [{ shadow: ["elev-1", "elev-2", "elev-3"] }],
      ease: [{ ease: ["standard", "enter", "exit"] }],
    },
  },
})
