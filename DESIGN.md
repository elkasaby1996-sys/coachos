---
name: Human Precision
version: 1.0.0
status: approved
updated: 2026-07-18
---

## Overview

RepSync uses **Human Precision**: a calm editorial system that pairs exact product evidence with the warmth of real coaching relationships. The visual narrative follows a coach's week from Monday workload to Friday follow-up. Pages should feel premium, useful, and human rather than like a generic fitness SaaS template.

Use open asymmetric layouts, generous whitespace, full-width tonal bands, and art-directed trainer/client photography. The signature **Sync Rail** is two parallel 1px lines separated by 4px; use it to anchor chapters, selected states, and transitions. Preserve clear product proof and direct calls to action throughout the story.

## Colors

| Role          | Token                 | Value     | Use                                 |
| ------------- | --------------------- | --------- | ----------------------------------- |
| Paper         | `surface`             | `#FBF9F1` | Default page canvas                 |
| Paper neutral | `paper`               | `#F3F1E9` | Alternate editorial canvas          |
| Surface low   | `surface-low`         | `#F6F4EC` | Quiet raised areas                  |
| Surface high  | `surface-high`        | `#EAE8E0` | Full-width grouping bands           |
| Ink           | `ink`                 | `#12231D` | Headings and dark sections          |
| Ink soft      | `ink-soft`            | `#404944` | Body copy                           |
| Forest        | `primary`             | `#0B4533` | Primary actions and brand anchors   |
| Forest mid    | `primary-container`   | `#285D49` | Secondary brand fields              |
| Sage          | `secondary-container` | `#D3E7DD` | Calm information bands              |
| Clay          | `tertiary`            | `#B66A47` | Human accents and priority signals  |
| Line          | `outline-variant`     | `#C0C9C2` | Dividers and Sync Rails             |
| Error         | `error`               | `#BA1A1A` | Destructive and invalid states only |

Use forest and clay with restraint. Maintain WCAG AA contrast for text. Do not use gradients, glass effects, glowing accents, or a palette dominated by a single hue family.

## Typography

Use **Instrument Sans** for navigation, controls, body copy, and display text. Use **Source Serif 4** only for editorial pull quotes, reflective statements, and short meta-commentary.

| Role             | Family          | Size    | Weight | Line height |
| ---------------- | --------------- | ------- | ------ | ----------- |
| Display desktop  | Instrument Sans | 64px    | 600    | 1.1         |
| Display mobile   | Instrument Sans | 40px    | 600    | 1.2         |
| Section heading  | Instrument Sans | 32-48px | 500    | 1.2         |
| Editorial accent | Source Serif 4  | 20px    | 400    | 1.5         |
| Body large       | Instrument Sans | 18px    | 400    | 1.6         |
| Body small       | Instrument Sans | 14px    | 400    | 1.5         |
| Label caps       | Instrument Sans | 12px    | 600    | 1.0         |

Keep letter spacing at `0` for display copy and use `0.08em` only for short uppercase labels. Keep body lines between roughly 55 and 75 characters where possible. Do not scale type continuously with viewport width.

## Elevation

Depth comes from tonal layering and line work, not shadows. The base is Paper, raised functional surfaces use `#FFFFFF` or `surface-low` with a 1px border, and full-width bands use Sage, warm paper, or Ink.

Controls use an 8px radius. Photography and substantial media use a 16px radius. Sync Rails remain square. Avoid nested cards, floating section containers, large drop shadows, and blurred backdrops.

## Components

**Buttons:** Primary buttons use Forest with white text. Secondary buttons use a transparent background and a 1px Ink border. Both use 8px corners, a minimum 44px target, and a 180-240ms color or 1px movement transition.

**Inputs:** Use a white or low surface, a 1px Sage/outline border, 8px corners, and a Forest focus state. Put a compact uppercase label above the input and keep validation text adjacent.

**Sync Rail:** Render two 1px parallel lines separated by 4px. Use horizontal rails for chapter transitions and vertical rails for timelines or active list items.

**Navigation:** Keep desktop navigation quiet and compact. Mobile navigation exposes the essential routes first. Use familiar icons for icon-only controls and provide tooltips or accessible labels.

**Media:** Show real trainers, clients, sessions, and review moments. Keep crops useful and faces or the coached action visible. Never use purely atmospheric imagery where product or service evidence is needed.

**Product proof:** Product frames are allowed as genuine tools, not decorative cards. Keep labels readable, surfaces flat, and the evidence directly related to the surrounding claim.

## Do’s and Don’ts

- Do structure the homepage as Monday workload, Tuesday attention, Wednesday delivery, Thursday connection, and Friday control.
- Do combine human imagery with concrete product evidence and credible operational copy.
- Do use full-width tonal bands and asymmetric editorial columns.
- Do keep all interactions keyboard accessible and honor reduced-motion preferences.
- Do preserve direct routes for demo, product, migration, security, and login actions.
- Don't use glassmorphism, gradients, decorative orbs, bokeh, or shadow-heavy cards.
- Don't hide whole sections behind entrance animation or create blank states during anchor navigation.
- Don't use generic fitness poses repeatedly or crop away the client-coach relationship.
- Don't expose implementation jargon where plain operational language is clearer.
- Don't put cards inside cards or turn every section into a boxed panel.
