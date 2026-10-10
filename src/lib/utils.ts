import { createCn } from "cn/config"

// Unregistered, tailwind-merge reads text-h4 as a colour and a later text colour silently drops it.
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [{ text: ["h1", "h2", "h3", "h4", "subtitle", "body", "small"] }],
      shadow: [{ shadow: ["elev-1", "elev-2", "elev-3"] }],
      ease: [{ ease: ["standard", "enter", "exit"] }],
    },
  },
})
