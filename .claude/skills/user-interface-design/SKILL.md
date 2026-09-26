---
name: user-interface-design
description: Use when doing any UI work or building React components.
---

# User Interface Design — ZulexGO

The design rules live in two documents. This skill holds no copy of either, so they cannot drift apart.

## Before any UI work

Read both in full:

1. **[docs/design-standard.md](../../../docs/design-standard.md)** — every visual decision: colour tokens and the contrast rules, typography, spacing, the brand wedge, elevation, motion, and §7's ready-made answers for the de-registration flow.
2. **[docs/site-contract.md](../../../docs/site-contract.md)** — what goes on each page: page structure (§1), the content fields and their constraints per section (§2), and behaviour — navigation, scroll, hover, mobile, transitions (§3).

Business rules shown in the UI — statuses, emails, fees, refunds — come from `docs/launch-plan.md`, never from memory of an older document.

## How to apply them

- Build from Shadcn primitives in `src/ui/`; tokens come from `@theme` in `app/globals.css`. A new custom component needs a reason.
- Every layout works on phones, tablets, laptops and large screens.
- When the two documents and a design request disagree, say so and ask; do not pick silently.
- Test the component's behaviour, not its look — `CLAUDE.md` § Testing. Check the look in a browser.
