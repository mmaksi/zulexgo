# ZulexGO — Design Standard

**Source:** `Zulex Style Guide.pdf`, 23.04.25, cronn GmbH (6 pages). Values were extracted from the file directly — colour swatches, type specimens, and the measured geometry of the brand's diagonal bar.

**How to read this document.** Every rule is tagged:
- **[S]ource** — stated or measured in the style guide. Do not change these without brand approval.
- **[D]erived** — not in the style guide, extrapolated to keep the brand coherent on screen. Change these only with a documented reason; then change them everywhere.

The style guide is a print document for a B2B product. This standard translates it to a consumer web app without inventing a new brand.

---

## 1. Atmosphere

Zulex looks like **official paperwork done properly** — not like a startup and not like a government portal. The character comes from four things:

1. **Flatness.** No gradients, no grain, no glow, no bevels anywhere in the source. Colour is applied as solid fill. Depth exists only where something genuinely floats above the page.
2. **Generous white space.** A4 pages carry 20 mm side margins and 40 mm of air above the first headline. Content sits low-density, left-aligned, in one column.
3. **One diagonal.** A single orange wedge — straight along the bottom, sloping gently down to the right — closes pages and sections. It is the only dynamic form in the system and it carries all the forward motion. Everything else is square.
4. **Heavy/light typographic contrast.** Headlines are extrabold uppercase set with *negative* leading; everything under H1 is Light. The page reads as a stamp followed by quiet text.

The emotional target: **precise, calm, competent, moving forward.** Never playful, never bureaucratic, never loud.

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
| `--color-white` | Primary background | The default page. The brand lives on white. |
| `--color-bg-blue` | Secondary background | Alternating sections, cards, table stripes, info banners, disabled fields. The **only** approved background tint — use it instead of a grey wash or a gradient. |
| `--color-grau` | Primary text + headings | All headings, body copy, icons, the grey half of the wordmark. |
| `--color-grau-dark` | High-emphasis text | Text on orange, focus rings, shadow colour, numeric values, footer/dark surfaces. |
| `--color-grau-bright` | Secondary text | Helper text, labels, placeholders, captions, borders, dividers. |
| `--color-orange` | Primary accent | Primary CTA fill, active/current state, the wedge, the orange half of the wordmark. **Never for body text.** |
| `--color-orange-dark` | Accent, interactive | Hover/active state of anything orange; orange text when text must be orange (large only). |
| `--color-orange-bright` | Accent, light surfaces | Orange on dark backgrounds, highlights, chart fills, hover on dark. |

**The 80/15/5 rule [D].** Roughly 80% of any screen is white or `bg-blue`, 15% is grey type and rules, 5% is orange. If a screen looks orange, it is wrong. Orange marks exactly one thing per view: the action the user should take next.

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

Three hard rules follow [D, forced by the measurements]:

1. **Never put white text on `--color-orange`.** The primary button is `#272828` on `#F49405` (6.40:1). The style guide's negative wordmark variants use white on orange — that is a *logo*, exempt as a brand mark; it is not a licence for UI text.
2. **Never set body text in orange.** Orange text is permitted only at ≥24px/bold, and then only in `--color-orange-dark`.
3. **Focus rings are `--color-grau-dark`, not orange.** Orange on white is 2.31:1 and fails the 3:1 requirement for non-text indicators.

### 2.4 Semantic colours [D — gap in the source]

The style guide defines no success/error/warning colours. Orange is the brand's *action* colour, so it cannot double as a warning. The de-registration status journey needs all three states, so this set is defined as an extension — desaturated to sit beside the brand rather than shout over it:

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

Warning text is always `--color-grau-dark` on `--color-warning-tint`; `--color-warning` is used only for the icon and the 4px left border. Never use `--color-orange` (brand) in a status role — a user must never confuse "your action is here" with "something is wrong."

---

## 3. Typography

### 3.1 Families

| Family | Weights in use | Role |
|---|---|---|
| **Kanit** [S] | 300 Light, 400 Regular (text below 16px, §3.2), 600 SemiBold Italic (wordmark only), 800 ExtraBold (H1 only) | Everything. |
| **Euro Plate Regular** [S] | Regular | **Licence plates only.** Uppercase-only face, includes the D/EU oval glyph. Never use it for UI text, headings, or reference numbers. |

```css
--font-sans:  'Kanit', 'Helvetica Neue', Arial, sans-serif;
--font-plate: 'Euro Plate', 'FE-Schrift', monospace;
```

Kanit is on Google Fonts. Load **only** 300, 400, 600 italic, and 800 — `display=swap`, self-hosted WOFF2 preferred, preload the 300 and 800 subsets. Euro Plate is a licensed font: load it lazily and only on views that render a plate; if it fails, the plate falls back to `--font-sans` 600 uppercase with `letter-spacing: 0.08em` inside the plate frame.

### 3.2 Scale

The source is a print scale in points, with line height as the second number (`size/leading`). **The ratio is the authoritative value** — it survives any rescaling; the px column is the desktop default.

| Style | Source [S] | Ratio | Desktop px [D] | Mobile px [D] | Weight | Case | Tracking |
|---|---|---|---|---|---|---|---|
| H1 | Kanit ExtraBold 48/46 | 0.96 | 64 / 61 | 40 / 38 | 800 | UPPERCASE | 0 |
| H2 | Kanit Light 32/29 | 0.91 | 42 / 38 | 30 / 27 | 300 | UPPERCASE | 0.01em |
| H3 | Kanit Light 24/22 | 0.92 | 32 / 29 | 24 / 22 | 300 | UPPERCASE | 0.01em |
| H4 | Kanit Light 20/18 | 0.90 | 26 / 23 | 21 / 19 | 300 | UPPERCASE | 0.02em |
| Subtitle | Kanit Light 16/20 | 1.25 | 21 / 26 | 18 / 23 | 300 | Sentence case | 0 |
| Body | Kanit Light 12/15 | 1.25 | 16 / 20 | 16 / 20 | 300 | Sentence case | 0 |
| Small [D] | — | 1.38 | 13 / 18 | 13 / 18 | 400 | Sentence case | 0.01em |

Print-to-screen conversion is `px = pt × 4/3`, which is why 12pt body lands exactly on 16px.

**The two signatures, in order of importance:**
- **Headings are set tight** (line height *below* 1). Never let a heading inherit a 1.4 body leading — it destroys the stamped look immediately.
- **Everything below H1 is Light (300).** Resist bolding H2–H4. Emphasis inside body copy uses `--color-grau-dark` or Kanit 400, not 700.

**Legibility guard [D].** Kanit Light below 14px is too fragile on low-DPI screens. Rule: Light (300) only at ≥16px. Anything smaller — captions, table cells, form labels, badges — uses Kanit **Regular (400)**. This is a deliberate screen adaptation of a print spec.

Uppercase headings need `hyphens: none` and `overflow-wrap: break-word`; German compound nouns in uppercase ExtraBold at 64px will overflow a 375px viewport otherwise. H1 may use `clamp(40px, 8vw, 64px)`.

### 3.3 Measure, alignment, rhythm

- Body measure: **60–75 characters**; `max-width: 65ch`. [D]
- All text is **left-aligned, ragged right** on screen. The source uses justified copy in places; do not reproduce justification on the web — it creates rivers at narrow widths. [D]
- Paragraph spacing: `margin-bottom: 16px`; no first-line indent. [D]
- Space above a heading is always larger than the space below it — 2:1. See §4.3. [D]

### 3.4 Wordmark

- Set in **Kanit SemiBold Italic, tracking −20** (= `letter-spacing: -0.02em`). [S]
- The ZulexGO lockup is `ZULEX` in `--color-grau` followed by `GO` in `--color-orange`, set as one word. The two-tone split is mandatory in every variant. [D, from the source's two-tone rule]
- On `--color-grau-dark` surfaces, `ZULEX` becomes white and `GO` becomes `--color-orange-bright` (8.01:1). These are the only two variants. [D]
- The lockup carries no claim. The source's claim "DIE ZULASSUNGSSOFTWARE DER ZUKUNFT" belongs to the Zulex B2B product and is not used in ZulexGO. [D]
- Minimum clear space around the lockup: **H/2 on all sides**, where H is the wordmark height. [D, by extension of the source's H/2 measure]
- Never re-colour beyond the two variants above, rotate, outline, or set the wordmark in another face.

> **Source, for reference.** The Zulex style guide splits the parent mark as `ZUL` in orange and `EX` in grau, with an icon of `Z` and `X` in colour-separated terminals and the claim below at H/2 [S]. ZulexGO is a separate product mark and does not reproduce that split.

---

## 4. Spacing

### 4.1 Base unit

**4px.** Every margin, padding, gap, and icon dimension is a multiple of 4. Line heights land on the same grid wherever the type ratio allows.

```css
--space-1:  4px;   --space-2:  8px;   --space-3:  12px;
--space-4:  16px;  --space-6:  24px;  --space-8:  32px;
--space-12: 48px;  --space-16: 64px;  --space-24: 96px;  --space-32: 128px;
```

Use 8px as the default step; 4px only for tight optical corrections (icon-to-label, badge padding).

### 4.2 Page frame

The source uses 20 mm margins on a 210 mm page — a **9.5% gutter**, and 40 mm (19% of page height) of air above the first headline. Preserved on the web as: [D, proportion from S]

| Viewport | Side gutter | Content max-width |
|---|---|---|
| <640px | 20px | — |
| 640–1023px | 32px | — |
| ≥1024px | 64px | **1200px, centred** |

At a 1440px viewport, a centred 1200px column yields 120px gutters — 8.3%, which lands almost exactly on the print proportion. That is the intent: the page should always feel like it has more margin than it needs.

### 4.3 Vertical rhythm

| Gap | Desktop | Mobile |
|---|---|---|
| Between page sections | 96px | 64px |
| Above a heading | 48px | 32px |
| Below a heading | 24px | 16px |
| Between paragraphs | 16px | 16px |
| Between form fields | 24px | 20px |
| Between related controls (label→input) | 8px | 8px |

The 2:1 above/below heading ratio is what groups a heading with its content. It is the single easiest rule to break and the most visible when broken.

### 4.4 Component padding

| Component | Padding |
|---|---|
| Button (default) | 12px 24px, min-height 48px |
| Button (small) | 8px 16px, min-height 40px |
| Input / select | 12px 16px, min-height 48px |
| Card | 24px desktop / 20px mobile |
| Banner / alert | 16px, with a 4px left border in the semantic colour |
| Modal | 32px desktop / 24px mobile |
| Table cell | 12px 16px |

Minimum tap target is **48×48px** everywhere; 44px is the floor only for inline icon buttons inside dense tables. [D]

### 4.5 Radius

**0px on brand shapes** — the wedge, the wordmark plate, photography crops are all hard-edged in the source. [S]

For UI, a restrained radius keeps forms from feeling like a PDF: [D]

```css
--radius-sm: 2px;  /* inputs, badges, small controls */
--radius-md: 4px;  /* buttons, cards, banners */
--radius-lg: 8px;  /* modals, sheets */
--radius-full: 999px; /* avatars, status dots only */
```

Never round the wedge. Never round a photograph.

---

## 5. Texture, depth, atmosphere

### 5.1 The wedge — the brand's only graphic device

Described in the source as "a bar that is straight along the bottom and runs down to the right along the top," used to close pages and sections. Measured from two separate instances in the file:

| Property | Measured value |
|---|---|
| Bottom edge | Perfectly horizontal, flush to the container edge (full bleed) |
| Top edge | Straight line (not a curve), descending left → right |
| **Slope** | **1.86% of width — 1.07°** — identical on both instances |
| Thickness, section divider | 12.1pt left → 1.1pt right (on a 595pt page) |
| Thickness, page terminator | 16.3pt left → 5.3pt right |
| Fill | Flat `--color-orange`. No gradient, no stroke, no shadow. |

**The slope is the invariant; the thickness is the variable.** Both instances in the source drop by exactly the same angle at different weights.

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
- Always **full bleed**, edge to edge — it ignores the content gutter. [S]
- Always **thick on the left, thin on the right**. Never mirror it, never flip it vertically, never stack two. [S]
- Maximum **one section wedge per viewport height**, plus the page terminator. It is punctuation; a page full of it is a page of commas. [D]
- Permitted recolours: `--color-grau` on a white background, or `--color-orange` on `--color-grau-dark`. Nothing else. [D]
- `aria-hidden="true"` — it is decoration, never a semantic separator. [D]

### 5.2 Flatness

No gradients, no noise/grain overlay, no glassmorphism, no glow, no inner shadows, no textured backgrounds. The source contains none of these and the brand's credibility depends on looking like a document rather than a landing page. Where you would reach for a gradient, use `--color-bg-blue` as a flat tint instead. [S]

The one permitted blur is a modal scrim: `rgba(39, 40, 40, 0.5)`, optionally with `backdrop-filter: blur(2px)`. [D]

### 5.3 Elevation

Depth is used only where an element genuinely floats above the page. Shadows are cast in `--color-grau-dark` at low alpha — never pure black, never tinted orange. [D]

```css
--elev-0: none;                                                        /* default: flat, use a border */
--elev-1: 0 1px 2px rgba(39,40,40,.06), 0 2px 8px rgba(39,40,40,.04);  /* raised card, hover */
--elev-2: 0 4px 16px rgba(39,40,40,.10);                               /* dropdown, popover, sticky header */
--elev-3: 0 12px 32px rgba(39,40,40,.16);                              /* modal, bottom sheet */
```

A resting card is `--elev-0` with `1px solid var(--color-bg-blue)`, or `1px solid var(--color-grau-bright)` when it needs to read as an input boundary. Cards rise to `--elev-1` on hover only if they are clickable.

### 5.4 Borders and rules

```css
--border-subtle: 1px solid #EDF5FC;  /* card edges, table rows */
--border-default:1px solid #58626D;  /* inputs, controls */
--border-strong: 2px solid #444C54;  /* focus-within, selected state */
```

Horizontal rules between content sections use `--border-subtle`. Do not use a full-width grey rule where a wedge belongs, and do not use a wedge where a quiet rule belongs.

### 5.5 Iconography

- **lucide**, imported from `lucide-react`. `ChevronRight` is the list bullet. [D]
- **One icon library, no exceptions.** Shadcn generates components with lucide imports already in them, so a second set would mean two systems in one codebase — one written by the CLI, one by hand. If an icon is missing, draw it as an inline SVG on lucide's 24×24 grid rather than adding a package. [D]
- Icon colour follows text colour; the bullet chevron is `--color-grau`. [S]
- Sizes: 16px inline with body, 20px in buttons, 24px standalone, 48px+ as a feature/decorative mark. All on the 4px grid. [D]
- lucide is a **stroked** set, not a filled one. Keep the default 2px stroke; drop to `strokeWidth={1.5}` at 24px and above, where 2px reads heavy beside Light text. [D]
- The chevron-right also sets the system's directional language: forward actions point right, back actions point left, disclosure points right and rotates 90° down when open. [D]

> **Deviation from the source — approved 2026-09-22.** The style guide specifies Font Awesome, solid style, with `fa-solid fa-chevron-right` as the list bullet [S]. ZulexGO uses lucide instead, for the single-library reason above. The brand is not affected: the icons are decorative, none of them is a brand mark, and every geometry rule in this section — the right-pointing chevron, the 90° disclosure rotation, the size scale, colour following text — is unchanged. The one visual consequence is stroke versus fill, which sits comfortably with §5.2 flatness. Do not "restore" Font Awesome as a drift fix; this is a decision, not an oversight.

### 5.6 Photography

- **Documentary, real, German.** The source shows actual registration documents, a licence plate blank, and a car key on a warm wooden desk — natural light, shallow depth of field, no filter, no stock-photo staging, no people smiling at a laptop. [S]
- Product shots are device mockups floating on white with a soft neutral shadow. [S]
- Crops are **hard rectangles — no rounded corners, no border, no overlay tint**. [S]
- Where a photograph needs to carry text, place the text beside it, not on it. The palette has no scrim treatment and orange type over a photograph fails contrast in every case. [D]
- In the de-registration flow, photography has a job: every security-code field is paired with a real photograph of where that code sits on the document or plate seal. Illustration is acceptable where a photo would expose real personal data. [D]

---

## 6. Interaction

None of this is in the source — it is a print document. All of §6 is **[D]**, derived from the brand's character: the forward-leaning italic wordmark, the right-pointing chevron, and the wedge that runs down to the right all say *movement to the right, at a steady pace, without bouncing.*

### 6.1 Motion principles

1. **Movement is horizontal and rightward.** Hover shifts go `translateX(+2px)`. Never bounce, never overshoot, never spring — this is a brand about official processes completing correctly.
2. **Short and crisp.** If a transition is noticeable as an animation, it is too slow.
3. **Colour before geometry.** Prefer changing a fill or border over moving or scaling an element. The system is flat; it should not wobble.
4. **Nothing animates on load** except content genuinely arriving (a status update, a fetched document).

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

Never use `ease-in-out` on a hover, never use a bounce/elastic curve anywhere, and never exceed 300ms.

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

Focus rings are **never** removed and **never** orange (2.31:1 — fails). `:focus-visible` only, so mouse users do not see rings; keyboard users always do.

Hover effects apply only under `@media (hover: hover)` — Tailwind v4 `hover:` already does this — so touch devices never show a stuck hover. On touch, the active state is the feedback.

### 6.4 Component behaviour

- **Buttons under load**: label is replaced by an inline spinner, width is locked to prevent reflow, the control is disabled. No full-page overlay for an in-place action.
- **Accordion / disclosure**: height transitions at `--duration-base` with `--ease-standard`; the chevron rotates 90° over the same duration.
- **Modal**: scrim fades in 200ms; panel fades and rises 8px over 200ms `--ease-enter`. Exit is 120ms `--ease-exit`. Focus is trapped and returns to the trigger on close.
- **Toast / inline alert**: fades in over 200ms, no slide. Validation errors never appear as toasts — they live at the field.
- **Step transitions in the funnel**: outgoing step fades out 120ms, incoming fades in and shifts `translateX(8px) → 0` over 200ms. The direction reverses on "back". Scroll resets to top; the first invalid field takes focus on a failed submit.
- **Status stepper**: when a step completes, its mark draws in over 200ms once, and the row's background fades from white to `--color-success-tint`. The current step shows a 1.5s pulse on its dot at 0.4→1 opacity while polling — this is the only looping animation permitted in the system, and it stops the moment the status resolves.
- **Skeletons**: flat `--color-bg-blue` blocks. No shimmer sweep — the shimmer is a gradient, and the brand is flat.

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

Colour and opacity changes remain (they communicate state); movement, the stepper pulse, and smooth scrolling are removed. No information may exist only in motion.

---

## 7. Applying this to the de-registration flow

Quick resolutions for decisions this app will hit immediately, so they are not re-litigated per component:

- **Primary CTA** ("Weiter", "Jetzt bezahlen"): orange fill `#F49405`, text `#272828`, `--radius-md`, 12px/24px padding, min-height 48px. One per screen.
- **Price display**: Kanit 300 at H3 size in `--color-grau-dark`. Never orange — the price is information, not the action.
- **Licence plate input/display**: Euro Plate on white inside a 2px `--color-grau-dark` frame with the blue EU bar at the left. This is the one place the plate font appears.
- **Security-code fields**: `--font-sans` 400, `letter-spacing: 0.2em`, uppercase, centred, one box per field, each paired with a photograph of where the code is found.
- **Status steps**: pending = `--color-grau-bright` on white; current = `--color-orange` dot, `--color-grau-dark` label, pulsing; complete = `--color-success` mark on `--color-success-tint`; failed = `--color-error` on `--color-error-tint`.
- **Section endings**: `.wedge--section` between landing-page sections; `.wedge--page` directly above the footer. Not inside the funnel — the funnel is one continuous task and should not be punctuated.

---

## 8. Open questions for the brand owner

1. **White-on-orange in the logo vs. UI.** The negative wordmark variants use white on orange at 2.31:1. Confirmed here as a brand-mark exemption; UI text on orange is `#272828`. Needs sign-off.
2. **No semantic palette in the source.** §2.4 is an extension. Success/error greens and reds should be approved rather than inherited from this document.
3. **Kanit Light at small sizes.** §3.2 raises small text to Regular (400) on screen. This departs from the print spec, which uses Light throughout.
4. **Euro Plate licensing** for web embedding (WOFF2) — needs confirmation; §3.1 defines the fallback if it is not licensed.
5. **Dark mode** is undefined in the source and deliberately not invented here. If it is needed, `--color-grau-dark` as the surface with `--color-orange-bright` as the accent (8.01:1) is the natural starting point.
