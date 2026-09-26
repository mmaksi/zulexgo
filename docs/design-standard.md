# ZulexGO — Design Standard

**Source:** `Zulex Style Guide.pdf`, 23.04.25, cronn GmbH (6 pages); values extracted directly — colour swatches, type specimens, measured geometry of the diagonal bar.

**Tags:**
- **[S]ource** — stated or measured in the style guide. Change only with brand approval.
- **[D]erived** — extrapolated to keep the brand coherent on screen. Change only with a documented reason, then everywhere.

The style guide is a print document for a B2B product; this translates it to a consumer web app without inventing a new brand.

---

## 1. Atmosphere

**Official paperwork done properly** — not a startup, not a government portal. Four traits:

1. **Flatness.** No gradients, grain, glow or bevels. Solid fill only. Depth only where something genuinely floats.
2. **Generous white space.** A4 pages: 20 mm side margins, 40 mm above the first headline. Low-density, left-aligned, one column.
3. **One diagonal.** A single orange wedge — straight bottom, top sloping gently down to the right — closes pages and sections. The only dynamic form; carries all forward motion. Everything else is square.
4. **Heavy/light type contrast.** Headlines extrabold uppercase with *negative* leading; everything under H1 is Light. A stamp followed by quiet text.

Target: **precise, calm, competent, moving forward.** Never playful, bureaucratic or loud.

---

## 2. Colour palette

### 2.1 Tokens

```css
:root {
  /* Primary — [S] */
  --color-orange:        #F49405; /* rgb(244,148,5)   CMYK 0/39/98/4  */
  --color-grau:          #444C54; /* rgb(68,76,84)    CMYK 19/10/0/67 */

  /* Secondary — [S] */
  --color-orange-dark:   #C37604; /* rgb(195,118,4)   CMYK 0/39/98/24 */
  --color-orange-bright: #FBB03F; /* rgb(251,176,63)  CMYK 0/30/75/2  */
  --color-grau-dark:     #272828; /* rgb(39,40,40)    CMYK 2/0/0/84   */
  --color-grau-bright:   #58626D; /* rgb(88,98,109)   CMYK 19/10/0/57 */
  --color-bg-blue:       #EDF5FC; /* rgb(237,245,252) CMYK 6/3/0/1    */
  --color-white:         #FFFFFF;
}
```

### 2.2 Roles

| Token | Role | Use for |
|---|---|---|
| `--color-white` | Primary background | Default page. The brand lives on white. |
| `--color-bg-blue` | Secondary background | Alternating sections, cards, table stripes, info banners, disabled fields. The **only** approved tint — instead of grey wash or gradient. |
| `--color-grau` | Primary text + headings | Headings, body, icons, grey half of wordmark. |
| `--color-grau-dark` | High-emphasis text | Text on orange, focus rings, shadow colour, numeric values, footer/dark surfaces. |
| `--color-grau-bright` | Secondary text | Helper text, labels, placeholders, captions, borders, dividers. |
| `--color-orange` | Primary accent | Primary CTA fill, active/current state, the wedge, orange half of wordmark. **Never body text.** |
| `--color-orange-dark` | Accent, interactive | Hover/active of anything orange; orange text when required (large only). |
| `--color-orange-bright` | Accent, light surfaces | Orange on dark backgrounds, highlights, chart fills, hover on dark. |

**80/15/5 rule [D].** ~80% of a screen white or `bg-blue`, 15% grey type and rules, 5% orange. If a screen looks orange, it is wrong. Orange marks exactly one thing per view: the user's next action.

### 2.3 Contrast — non-negotiable rules

Measured WCAG 2.1 ratios:

| Foreground | Background | Ratio | Verdict |
|---|---|---|---|
| `grau-dark` | white | 14.78 | AAA |
| `grau` | white | 8.72 | AAA |
| `grau-bright` | white | 6.21 | AA |
| `grau` | `bg-blue` | 7.92 | AAA |
| `grau-bright` | `bg-blue` | 5.64 | AA |
| **white** | **`orange`** | **2.31** | **FAILS** |
| `grau-dark` | `orange` | 6.40 | AA |
| `grau-dark` | `orange-bright` | 8.01 | AAA |
| white | `orange-dark` | 3.55 | Large text / non-text only |
| `orange` | white | 2.31 | FAILS |
| `orange-dark` | white | 3.55 | Large text / non-text only |
| `orange-bright` | `grau-dark` | 8.01 | AAA |

Hard rules [D, forced by the measurements]:

1. **Never white text on `--color-orange`.** Primary button is `#272828` on `#F49405` (6.40:1). The guide's negative wordmark variants (white on orange) are a *logo*, exempt as a brand mark — not a licence for UI text.
2. **Never body text in orange.** Orange text only at ≥24px/bold, and only in `--color-orange-dark`.
3. **Focus rings are `--color-grau-dark`, not orange.** Orange on white (2.31:1) fails the 3:1 non-text requirement.

### 2.4 Semantic colours [D — gap in the source]

The guide defines no success/error/warning. Orange is the *action* colour, so it cannot double as warning. The status journey needs all three, so this extension is desaturated to sit beside the brand:

```css
:root {
  --color-success:      #15703F; /* 6.14:1 on white */
  --color-success-tint: #E8F3ED;
  --color-error:        #A32A1E; /* 7.22:1 on white */
  --color-error-tint:   #FBEAE8;
  --color-warning:      #C37604; /* = orange-dark; 3.55:1 → icon/border only */
  --color-warning-tint: #FEF4E4;
  --color-info:         #444C54; /* = grau */
  --color-info-tint:    #EDF5FC; /* = bg-blue */
}
```

Warning text is always `--color-grau-dark` on `--color-warning-tint`; `--color-warning` only for the icon and 4px left border. Never use `--color-orange` in a status role — "your action is here" must never be confused with "something is wrong."

---

## 3. Typography

### 3.1 Families

| Family | Weights in use | Role |
|---|---|---|
| **Kanit** [S] | 300 Light, 400 Regular (text below 16px, §3.2), 600 SemiBold Italic (wordmark only), 800 ExtraBold (H1 only) | Everything. |
| **Euro Plate Regular** [S] | Regular | **Licence plates only.** Uppercase-only, includes the D/EU oval glyph. Never for UI text, headings or reference numbers. |

```css
--font-sans:  'Kanit', 'Helvetica Neue', Arial, sans-serif;
--font-plate: 'Euro Plate', 'FE-Schrift', monospace;
```

Kanit (Google Fonts): load **only** 300, 400, 600 italic, 800 — `display=swap`, self-hosted WOFF2 preferred, preload 300 and 800 subsets. Euro Plate is licensed: load lazily, only on views rendering a plate; on failure, fall back to `--font-sans` 600 uppercase, `letter-spacing: 0.08em`, inside the plate frame.

### 3.2 Scale

Source is a print scale in points, `size/leading`. **Ratio is authoritative** (survives rescaling); px is the desktop default.

| Style | Source [S] | Ratio | Desktop px [D] | Mobile px [D] | Weight | Case | Tracking |
|---|---|---|---|---|---|---|---|
| H1 | Kanit ExtraBold 48/46 | 0.96 | 64 / 61 | 40 / 38 | 800 | UPPERCASE | 0 |
| H2 | Kanit Light 32/29 | 0.91 | 42 / 38 | 30 / 27 | 300 | UPPERCASE | 0.01em |
| H3 | Kanit Light 24/22 | 0.92 | 32 / 29 | 24 / 22 | 300 | UPPERCASE | 0.01em |
| H4 | Kanit Light 20/18 | 0.90 | 26 / 23 | 21 / 19 | 300 | UPPERCASE | 0.02em |
| Subtitle | Kanit Light 16/20 | 1.25 | 21 / 26 | 18 / 23 | 300 | Sentence case | 0 |
| Body | Kanit Light 12/15 | 1.25 | 16 / 20 | 16 / 20 | 300 | Sentence case | 0 |
| Small [D] | — | 1.38 | 13 / 18 | 13 / 18 | 400 | Sentence case | 0.01em |

Conversion `px = pt × 4/3` (12pt body = 16px).

**Two signatures, by importance:**
- **Headings set tight** (line height *below* 1). Never inherit a 1.4 body leading — it destroys the stamped look.
- **Everything below H1 is Light (300).** Don't bold H2–H4. Emphasis in body uses `--color-grau-dark` or Kanit 400, not 700.

**Legibility guard [D].** Kanit Light below 14px is fragile on low-DPI screens. Light (300) only at ≥16px; anything smaller — captions, table cells, form labels, badges — uses **Regular (400)**. Deliberate screen adaptation of the print spec.

Uppercase headings need `hyphens: none` and `overflow-wrap: break-word` (German compounds in uppercase ExtraBold at 64px overflow a 375px viewport otherwise). H1 may use `clamp(40px, 8vw, 64px)`.

### 3.3 Measure, alignment, rhythm

- Body measure **60–75 characters**; `max-width: 65ch`. [D]
- All text **left-aligned, ragged right**. The source justifies in places; don't on the web — rivers at narrow widths. [D]
- Paragraph spacing `margin-bottom: 16px`; no first-line indent. [D]
- Space above a heading : below = 2:1. See §4.3. [D]

### 3.4 Wordmark

- **Kanit SemiBold Italic, tracking −20** (= `letter-spacing: -0.02em`). [S]
- Lockup: `ZULEX` in `--color-grau` + `GO` in `--color-orange`, one word. Two-tone split mandatory in every variant. [D, from the source's two-tone rule]
- On `--color-grau-dark` surfaces: `ZULEX` white, `GO` `--color-orange-bright` (8.01:1). Only these two variants. [D]
- No claim. The source's "DIE ZULASSUNGSSOFTWARE DER ZUKUNFT" belongs to Zulex B2B, not ZulexGO. [D]
- Minimum clear space **H/2 on all sides**, H = wordmark height. [D, by extension of the source's H/2 measure]
- Never re-colour beyond the two variants, rotate, outline, or set in another face.

> **Source, for reference.** The guide splits the parent mark as `ZUL` orange / `EX` grau, with an icon of `Z` and `X` in colour-separated terminals and the claim below at H/2 [S]. ZulexGO is a separate product mark and does not reproduce that split.

---

## 4. Spacing

### 4.1 Base unit

**4px.** Every margin, padding, gap and icon dimension is a multiple of 4. Line heights land on the grid where the ratio allows.

```css
--space-1:  4px;   --space-2:  8px;   --space-3:  12px;
--space-4:  16px;  --space-6:  24px;  --space-8:  32px;
--space-12: 48px;  --space-16: 64px;  --space-24: 96px;  --space-32: 128px;
```

Default step 8px; 4px only for tight optical corrections (icon-to-label, badge padding).

### 4.2 Page frame

Source: 20 mm margins on 210 mm page (**9.5% gutter**), 40 mm (19% of page height) above the first headline. On the web: [D, proportion from S]

| Viewport | Side gutter | Content max-width |
|---|---|---|
| <640px | 20px | — |
| 640–1023px | 32px | — |
| ≥1024px | 64px | **1200px, centred** |

At 1440px, a centred 1200px column gives 120px gutters (8.3%) — near the print proportion. The page should always feel like it has more margin than it needs.

### 4.3 Vertical rhythm

| Gap | Desktop | Mobile |
|---|---|---|
| Between page sections | 96px | 64px |
| Above a heading | 48px | 32px |
| Below a heading | 24px | 16px |
| Between paragraphs | 16px | 16px |
| Between form fields | 24px | 20px |
| Between related controls (label→input) | 8px | 8px |

The 2:1 above/below heading ratio groups a heading with its content — easiest rule to break, most visible when broken.

### 4.4 Component padding

| Component | Padding |
|---|---|
| Button (default) | 12px 24px, min-height 48px |
| Button (small) | 8px 16px, min-height 40px |
| Input / select | 12px 16px, min-height 48px |
| Card | 24px desktop / 20px mobile |
| Banner / alert | 16px, 4px left border in the semantic colour |
| Modal | 32px desktop / 24px mobile |
| Table cell | 12px 16px |

Minimum tap target **48×48px** everywhere; 44px floor only for inline icon buttons in dense tables. [D]

### 4.5 Radius

**0px on brand shapes** — wedge, wordmark plate, photo crops are hard-edged. [S]

UI gets a restrained radius so forms don't feel like a PDF: [D]

```css
--radius-sm: 2px;  /* inputs, badges, small controls */
--radius-md: 4px;  /* buttons, cards, banners */
--radius-lg: 8px;  /* modals, sheets */
--radius-full: 999px; /* avatars, status dots only */
```

Never round the wedge or a photograph.

---

## 5. Texture, depth, atmosphere

### 5.1 The wedge — the brand's only graphic device

Source: "a bar that is straight along the bottom and runs down to the right along the top," closing pages and sections. Measured from two instances:

| Property | Measured value |
|---|---|
| Bottom edge | Perfectly horizontal, flush to container edge (full bleed) |
| Top edge | Straight line (not a curve), descending left → right |
| **Slope** | **1.86% of width — 1.07°** — identical on both instances |
| Thickness, section divider | 12.1pt left → 1.1pt right (on a 595pt page) |
| Thickness, page terminator | 16.3pt left → 5.3pt right |
| Fill | Flat `--color-orange`. No gradient, stroke or shadow. |

**Slope is invariant; thickness is variable.**

```css
:root { --wedge-slope: 0.0186; } /* 1.07° — do not change */

.wedge {
  --wedge-min: 2px;                 /* thickness at the RIGHT edge */
  width: 100%;
  height: calc(var(--wedge-min) + 100vw * var(--wedge-slope));
  background: var(--color-orange);
  clip-path: polygon(0 0, 100% calc(100% - var(--wedge-min)), 100% 100%, 0 100%);
}

.wedge--section { --wedge-min: 2px; }  /* between content sections */
.wedge--page    { --wedge-min: 8px; }  /* above the footer, closes the page */
```

Rules:
- Always **full bleed** — ignores the content gutter. [S]
- Always **thick left, thin right**. Never mirror, flip vertically, or stack two. [S]
- Max **one section wedge per viewport height**, plus the page terminator. It is punctuation. [D]
- Permitted recolours only: `--color-grau` on white, or `--color-orange` on `--color-grau-dark`. [D]
- `aria-hidden="true"` — decoration, never a semantic separator. [D]

### 5.2 Flatness

No gradients, noise/grain, glassmorphism, glow, inner shadows or textured backgrounds — the brand must look like a document, not a landing page. Instead of a gradient, use flat `--color-bg-blue`. [S]

Only permitted blur: modal scrim `rgba(39, 40, 40, 0.5)`, optionally `backdrop-filter: blur(2px)`. [D]

### 5.3 Elevation

Depth only where an element genuinely floats. Shadows in `--color-grau-dark` at low alpha — never pure black, never orange-tinted. [D]

```css
--elev-0: none;                                                        /* default: flat, use a border */
--elev-1: 0 1px 2px rgba(39,40,40,.06), 0 2px 8px rgba(39,40,40,.04);  /* raised card, hover */
--elev-2: 0 4px 16px rgba(39,40,40,.10);                               /* dropdown, popover, sticky header */
--elev-3: 0 12px 32px rgba(39,40,40,.16);                              /* modal, bottom sheet */
```

Resting card: `--elev-0` with `1px solid var(--color-bg-blue)`, or `1px solid var(--color-grau-bright)` when it must read as an input boundary. Rises to `--elev-1` on hover only if clickable.

### 5.4 Borders and rules

```css
--border-subtle: 1px solid #EDF5FC;  /* card edges, table rows */
--border-default:1px solid #58626D;  /* inputs, controls */
--border-strong: 2px solid #444C54;  /* focus-within, selected state */
```

Rules between content sections use `--border-subtle`. No full-width grey rule where a wedge belongs, no wedge where a quiet rule belongs.

### 5.5 Iconography

- **lucide** from `lucide-react`. `ChevronRight` is the list bullet. [D]
- **One icon library, no exceptions** — Shadcn generates lucide imports; a second set means two systems. Missing icon: inline SVG on lucide's 24×24 grid, not a new package. [D]
- Icon colour follows text colour; bullet chevron is `--color-grau`. [S]
- Sizes: 16px inline with body, 20px in buttons, 24px standalone, 48px+ feature/decorative. All on the 4px grid. [D]
- lucide is **stroked**. Keep default 2px stroke; `strokeWidth={1.5}` at 24px and above (2px reads heavy beside Light text). [D]
- Directional language: forward points right, back points left, disclosure points right and rotates 90° down when open. [D]

> **Deviation from the source — approved 2026-09-22.** The guide specifies Font Awesome solid, `fa-solid fa-chevron-right` as list bullet [S]. ZulexGO uses lucide for the single-library reason. Brand unaffected: icons are decorative, none is a brand mark, and every geometry rule here (right chevron, 90° disclosure rotation, size scale, colour follows text) is unchanged. Only consequence is stroke vs fill, consistent with §5.2 flatness. Do not "restore" Font Awesome as a drift fix; this is a decision, not an oversight.

### 5.6 Photography

- **Documentary, real, German.** Source: actual registration documents, a licence plate blank, a car key on a warm wooden desk — natural light, shallow depth of field, no filter, no stock staging, no people smiling at a laptop. [S]
- Product shots: device mockups floating on white with a soft neutral shadow. [S]
- Crops are **hard rectangles — no rounded corners, border or overlay tint**. [S]
- Text goes beside a photograph, not on it — no scrim treatment exists and orange type over a photo always fails contrast. [D]
- In the de-registration flow, every security-code field is paired with a real photograph of where that code sits on the document or plate seal. Illustration is acceptable where a photo would expose real personal data. [D]

---

## 6. Interaction

All of §6 is **[D]** (the source is print), derived from the forward-leaning italic wordmark, right-pointing chevron and down-right wedge: *movement to the right, steady pace, no bouncing.*

### 6.1 Motion principles

1. **Horizontal and rightward.** Hover shifts `translateX(+2px)`. Never bounce, overshoot or spring.
2. **Short and crisp.** If noticeable as an animation, it is too slow.
3. **Colour before geometry.** Change fill or border rather than move or scale. Nothing wobbles.
4. **Nothing animates on load** except content genuinely arriving (status update, fetched document).

### 6.2 Timing and easing

```css
--duration-instant: 100ms; /* colour/opacity on small controls */
--duration-fast:    150ms; /* default: hover, focus, border, background */
--duration-base:    200ms; /* entrances, accordion, tooltip, step change */
--duration-slow:    300ms; /* modal, bottom sheet, layout change */

--ease-standard: cubic-bezier(0.4, 0, 0.2, 1); /* state changes, both directions */
--ease-enter:    cubic-bezier(0.2, 0, 0, 1);   /* things arriving */
--ease-exit:     cubic-bezier(0.4, 0, 1, 1);   /* things leaving, at 120ms */
```

Never `ease-in-out` on hover, never bounce/elastic curves, never exceed 300ms.

### 6.3 Hover, focus, active — by element type

| Element | Hover | Active/pressed | Focus-visible |
|---|---|---|---|
| **Primary button** (`orange` bg, `grau-dark` text) | background → `--color-orange-dark`, 150ms. No lift, no scale. | background → `#A96503`; no transform | 2px `--color-grau-dark` outline, 2px offset |
| **Secondary button** (`grau` border + text, transparent) | background → `--color-bg-blue`, border → `--color-grau-dark` | background → `#DCE8F5` | as above |
| **Tertiary / text button** | text → `--color-orange-dark`, underline appears | text → `--color-grau-dark` | as above |
| **Inline text link** | underline thickens 1px→2px, colour → `--color-orange-dark` | colour → `--color-grau-dark` | as above |
| **Clickable card** | border → `--color-grau-bright`, `--elev-0` → `--elev-1`, 150ms | `--elev-0`, no transform | 2px outline, 2px offset |
| **List row / nav item** | background → `--color-bg-blue`, chevron `translateX(2px)` | background holds | 2px inset outline |
| **Text input** | border → `--color-grau`, 150ms | — | border → `--color-grau-dark` **2px** + `--color-bg-blue` background; no glow |
| **Checkbox / radio** | border → `--color-grau-dark` | — | 2px outline, 2px offset; checked fill `--color-orange` with a `--color-grau-dark` mark |
| **Disabled anything** | no hover response, `cursor: not-allowed` | — | still focusable if it explains why |
| **Icon-only button** | background → `--color-bg-blue`, radius `--radius-sm` | — | 2px outline |

Focus rings **never** removed, **never** orange (2.31:1 fails). `:focus-visible` only — keyboard users always see rings, mouse users don't.

Hover only under `@media (hover: hover)` (Tailwind v4 `hover:` does this) so touch never shows stuck hover; on touch, active state is the feedback.

### 6.4 Component behaviour

- **Buttons under load**: label replaced by inline spinner, width locked to prevent reflow, control disabled. No full-page overlay for in-place actions.
- **Accordion / disclosure**: height transitions at `--duration-base` / `--ease-standard`; chevron rotates 90° over the same duration.
- **Modal**: scrim fades in 200ms; panel fades and rises 8px over 200ms `--ease-enter`. Exit 120ms `--ease-exit`. Focus trapped, returns to trigger on close.
- **Toast / inline alert**: fades in 200ms, no slide. Validation errors never toasts — they live at the field.
- **Funnel step transitions**: outgoing fades out 120ms; incoming fades in and shifts `translateX(8px) → 0` over 200ms. Direction reverses on "back". Scroll resets to top; first invalid field takes focus on failed submit.
- **Status stepper**: completed step's mark draws in over 200ms once; row background fades white → `--color-success-tint`. Current step: 1.5s pulse on its dot at 0.4→1 opacity while polling — the only looping animation permitted; stops the moment status resolves.
- **Skeletons**: flat `--color-bg-blue` blocks. No shimmer (it is a gradient).

### 6.5 Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Colour and opacity changes remain (they communicate state); movement, stepper pulse and smooth scrolling are removed. No information may exist only in motion.

---

## 7. Applying this to the de-registration flow

Settled decisions — do not re-litigate per component:

- **Primary CTA** ("Weiter", "Jetzt bezahlen"): fill `#F49405`, text `#272828`, `--radius-md`, 12px/24px padding, min-height 48px. One per screen.
- **Price display**: Kanit 300 at H3 size, `--color-grau-dark`. Never orange — price is information, not action.
- **Licence plate input/display**: Euro Plate on white in a 2px `--color-grau-dark` frame with the blue EU bar at left. The only place the plate font appears.
- **Security-code fields**: `--font-sans` 400, `letter-spacing: 0.2em`, uppercase, centred, one box per field, each paired with a photograph of where the code is found.
- **Status steps**: pending = `--color-grau-bright` on white; current = `--color-orange` dot, `--color-grau-dark` label, pulsing; complete = `--color-success` mark on `--color-success-tint`; failed = `--color-error` on `--color-error-tint`.
- **Section endings**: `.wedge--section` between landing-page sections; `.wedge--page` directly above the footer. Not inside the funnel — one continuous task, not punctuated.

---

## 8. Open questions for the brand owner

1. **White-on-orange in logo vs. UI.** Negative wordmark variants are white on orange at 2.31:1. Treated here as a brand-mark exemption; UI text on orange is `#272828`. Needs sign-off.
2. **No semantic palette in the source.** §2.4 is an extension; success/error greens and reds should be approved, not inherited from this document.
3. **Kanit Light at small sizes.** §3.2 raises small text to Regular (400) on screen, departing from the print spec (Light throughout).
4. **Euro Plate licensing** for web embedding (WOFF2) — needs confirmation; §3.1 defines the fallback.
5. **Dark mode** undefined in the source and deliberately not invented. If needed, start from `--color-grau-dark` surface with `--color-orange-bright` accent (8.01:1).
