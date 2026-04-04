# Repsync UI Playbook

This document explains how to extend the current Repsync visual language across the rest of the app without redesigning every page from scratch.

## Start Here

Use these documents in order:

| Step | File | Purpose |
|---|---|---|
| 1 | `design-system/repsync/MASTER.md` | App-wide visual and interaction rules |
| 2 | `design-system/repsync/pages/pt-hub.md` | PT Hub-specific overrides |
| 3 | `docs/repsync-ui-playbook.md` | Practical implementation guidance for new pages |

## Design Summary

Repsync's current direction is a premium operational SaaS system with:

- a dark-first shell
- a mineral daylight light mode
- glass and gradient surfaces
- athletic typography
- action-first information hierarchy
- restrained, ambient motion

The goal is not to make every page dramatic. The goal is to make every page feel like it belongs to the same product.

## What We Standardized

| Area | Decision |
|---|---|
| Brand feel | Premium, athletic, operational |
| Default theme | Dark mode remains the primary product experience |
| Light theme | Soft mineral blue-slate glass, not white mode |
| Typography | `Barlow Condensed` for headings, `Barlow` for body and utility text |
| Shell language | Frosted glass surfaces, visible borders, controlled shadows |
| Motion | Ambient and intentional, never gimmicky |

## App-Wide Styling Rules

### 1. Build around one strong outer shell

Pages should usually have:

- one strong page shell or section shell
- flatter internal rows
- fewer nested bordered containers

If an item is just part of a list, it usually should not become its own fully framed mini-card.

### 2. Use pills sparingly

Pills should only exist when they communicate:

- state
- priority
- category
- theme control

Do not add pills for decoration alone.

### 3. Use helper text only when it resolves uncertainty

Helper text is appropriate when it:

- explains a decision
- clarifies what a section is for
- prevents a dead-end empty state

Helper text is not appropriate when the label already says enough.

### 4. Favor operational hierarchy over decorative hierarchy

On work pages, the user should understand:

1. where they are
2. what matters now
3. what they can do next

before they notice decorative effects.

## Theme Guidance

| Theme Area | Dark Theme | Light Theme |
|---|---|---|
| Canvas | Deep charcoal and slate | Tinted mineral blue-gray |
| Accent role | Existing PT Hub accent behavior | Cooler teal-blue blend |
| Positive status | Success green | Success green |
| Glass fill | Dark translucent panels | Frosted tinted panels |
| Motion intensity | Richer | Softer and more recessive |

### Light Theme Rules

The light theme should not feel like the dark theme with white paint poured over it.

Use these checks:

| Check | Good Result |
|---|---|
| First impression | Feels premium and cool-toned, not blank or clinical |
| Surface depth | Cards still read as glass, not paper |
| Accent visibility | Accent is noticeable without turning the page green |
| Background harmony | Motion sits behind the UI and supports it |

## Motion Guidance

| Motion Type | Use |
|---|---|
| Ambient background | Page atmosphere and product identity |
| Hover feedback | Small lifts, border changes, color shifts |
| Section transitions | Smooth opacity and positional easing |
| Loading states | Skeletons and calm progressive reveal |

Avoid:

| Avoid | Why |
|---|---|
| Scroll-jacking | Hurts usability and accessibility |
| Large hover scale | Makes the interface feel unstable |
| Fast decorative animation | Cheapens the premium tone |
| Background effects above content | Breaks readability |

## Component Reuse Map

When extending this style, start from the existing shared building blocks.

| Need | Start With |
|---|---|
| PT Hub shell | `src/components/layouts/pt-hub-layout.tsx` |
| PT Hub section shell | `src/features/pt-hub/components/pt-hub-section-card.tsx` |
| PT Hub overview composition | `src/features/pt-hub/components/pt-hub-overview-sections.tsx` |
| Shared stat treatment | `src/components/ui/coachos/stat-card.tsx` |
| Animated page atmosphere | `src/features/pt-hub/components/pt-hub-animated-background.tsx` |
| Client shell reference | `src/components/layouts/client-layout.tsx` |

## Page Recipes

### Operational Dashboard

| Section | Guidance |
|---|---|
| KPI row | 3-4 compact metrics max |
| Main module | Action-first section |
| Supporting modules | Recent activity, checklist, summary cards |
| Empty states | Explain why the section matters and include a CTA |

### Detail Page

| Section | Guidance |
|---|---|
| Header | Strong title, concise context, minimal utility actions |
| Primary content | One dominant panel or tab area |
| Secondary content | Supporting cards or related actions |
| Repetition | Remove duplicated status summaries |

### Settings Page

| Section | Guidance |
|---|---|
| Grouping | Use quiet section boundaries |
| Copy density | Lower than dashboards |
| Inputs | Keep clear labels, calm helper text, visible focus |
| Alerts | Reserve stronger surfaces for destructive or risky sections |

## Content Rules

| Rule | Guidance |
|---|---|
| Terminology | Pick one canonical product term per page and keep it consistent |
| Labels | Prefer practical wording over brand flourish |
| Zero states | Tell the user what to do next |
| CTA labels | Use verbs tied to the destination |

## Delivery Checklist For New Pages

Before calling a new page complete, confirm:

| Area | Pass Criteria |
|---|---|
| Shell | Uses existing layout and surface language |
| Hierarchy | Main task is obvious |
| Contrast | Works in dark and light mode |
| Motion | Feels intentional and non-disruptive |
| Nesting | No unnecessary inner boxes remain |
| Pills | Only meaningful pills remain |
| Copy | Helper text appears only where needed |
| Responsive behavior | Verified at mobile, tablet, desktop, wide desktop |
| Accessibility | Keyboard, focus, headings, and reduced-motion support intact |

## Suggested Rollout Order For The Rest Of The App

Apply this system in this order so the product feels consistent quickly:

| Priority | Area | Reason |
|---|---|---|
| 1 | PT pages and PT dashboards | Closest to PT Hub and highest visual mismatch risk |
| 2 | Settings pages | High frequency and easy win for consistency |
| 3 | Client detail and admin-style pages | Benefit from the same surface and hierarchy cleanup |
| 4 | Public/auth pages | Should echo the system, but stay lighter and simpler than workspace shells |

## Notes On The Current PT Hub Pass

The PT Hub work established these reusable patterns:

- slimmer utility pills
- flatter dropdowns
- fewer nested boxes
- cleaner summary cards
- calmer light-mode glass
- background motion tuned to support the page instead of overpowering it

Use those as the reference point when redesigning adjacent pages.
