import { createCn } from "cn/config"

/** The custom `@theme` tokens in app/globals.css, so merging treats them by kind. */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [{ text: ["h1", "h2", "h3", "h4", "subtitle", "body", "small"] }],
      shadow: [{ shadow: ["elev-1", "elev-2", "elev-3"] }],
      ease: [{ ease: ["standard", "enter", "exit"] }],
    },
  },
})
