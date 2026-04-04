# Repsync Design System

> Use this file as the app-wide source of truth for future page work.
> If a page has an override in `design-system/repsync/pages/[page].md`, that file wins for page-specific decisions.

## Product Direction

Repsync uses a premium operational SaaS style, not a marketing-heavy one.

The design should feel:

- athletic
- premium
- calm under load
- action-first
- glass-forward without becoming noisy
- dense enough for serious work, but never cluttered

## Core Principles

| Principle | What It Means In Practice |
|---|---|
| Operational first | Show what the coach or user needs to do next before promotional or decorative content. |
| Premium restraint | Use rich surfaces, motion, and blur sparingly enough that the UI still feels sharp and trustworthy. |
| One clear hierarchy | Every screen should have one main job, one dominant section, and clear secondary content. |
| Glass with contrast | Frosted surfaces should still keep readable text, strong borders, and visible focus states. |
| Reuse before inventing | Extend existing shells, cards, and token systems before introducing new visual patterns. |

## Theme Model

| Theme | Role | Notes |
|---|---|
| Dark | Primary/default experience | Deep premium shell, stronger glow, highest dramatic contrast. |
| Light | Companion daylight mode | Mineral blue-slate glass, softer atmosphere, never plain white. |

### Dark Theme Rules

| Rule | Guidance |
|---|---|
| Background | Use deep slate and charcoal canvas tones with layered gradients. |
| Accent | Keep the current PT Hub dark accent behavior unchanged. |
| Surfaces | Use translucent glass panels with visible top highlights and soft edge borders. |
| Motion | Slightly richer than light mode, but still controlled. |

### Light Theme Rules

| Rule | Guidance |
|---|---|
| Background | Use fogged mineral blue and slate tones, not bright white. |
| Accent | Use cool teal-blue accents blended from the dark theme character, not green-led accents. |
| Surfaces | Keep glass depth through tinted translucency, soft highlights, and cool shadows. |
| Motion | Keep motion calmer than dark mode so the page and background feel aligned. |

## Color System

These are semantic roles, not strict one-off hex locks. Always favor existing CSS variables in `src/styles/globals.css`.

| Token Group | Dark Intent | Light Intent |
|---|---|---|
| Canvas | Deep slate / charcoal | Mineral blue-gray daylight |
| Sidebar | Slightly elevated shell surface | Tinted frosted side rail |
| Surface | Glass panel with dark translucency | Frosted mineral glass, not paper-white |
| Text primary | Soft white | Deep slate |
| Text secondary | Muted cool gray | Muted slate-blue |
| Border | Visible but soft glass edge | Slightly cooler and more visible than the fill |
| Accent | Performance highlight | Mineral teal-blue highlight |
| Success | Positive state only | Positive state only, not the primary light-theme accent |
| Warning / danger | Utility-only | Utility-only |

### Accent Usage Rules

| Use Case | Rule |
|---|---|
| Primary CTA | Use the theme accent, but keep fills controlled and readable. |
| Active nav / selected tabs | Prefer accent border + tinted surface instead of loud solid fills. |
| Positive status | Use success green only for success/health/payment-positive signals. |
| Light theme branding | Do not let green become the dominant identity color. |

## Typography

| Role | Font | Usage |
|---|---|---|
| Headings | `Barlow Condensed` | Section headers, page titles, strong dashboard labels |
| Body | `Barlow` | Paragraphs, helper text, labels, controls |
| Utility text | `Barlow` | Meta labels, pills, dropdown items, state text |

### Type Rules

| Rule | Guidance |
|---|---|
| Headings | Uppercase or near-uppercase is acceptable for app shells and dashboard headers when already used by the page. |
| Helper text | Use only when it prevents confusion or clarifies a next step. |
| Meta labels | Keep short, uppercase, and quiet. |
| Dense data | Increase spacing before reducing font size. |

## Surface System

| Surface | Purpose | Guidance |
|---|---|---|
| `surface-panel` | Standard content card | Base reusable card for most content blocks |
| `surface-panel-strong` | High-priority shell / featured card | Hero shell, sidebar shell, action center, important wrappers |
| `surface-panel-portal` | Floating overlay or portal surface | Dropdowns, menus, and floating utility panels |
| `surface-section` / `surface-subtle` | Interior grouping only | Use for mild grouping, not for deep nested card stacks |

### Surface Rules

| Do | Don't |
|---|---|
| Use one main outer card, then flatter internal rows | Stack boxes inside boxes inside boxes |
| Use subtle separators for internal structure | Add a full bordered mini-card for every item |
| Let the strongest cards anchor the page | Make every section equally loud |

## Layout Patterns

| Pattern | When To Use | Structure |
|---|---|---|
| App shell | Workspace or dashboard areas | Navigation rail, page header, main content canvas |
| Operational dashboard | Overview and management pages | Compact KPI row, action center, summary cards, recent activity |
| Detail workspace | Entity detail pages | Header, sticky utility actions, tab rail, content sections |
| Settings | Configuration screens | Lightweight header, grouped sections, quiet helper copy |

### Dashboard Rules

| Rule | Guidance |
|---|---|
| KPI row | Use 3-4 compact metrics max. |
| Main module | Lead with action-heavy content, not marketing copy. |
| Empty states | Always explain the value of the section and provide a CTA. |
| Summary cards | Only show cards that add new decision value. |
| Navigation duplication | Avoid "shortcut" sections that just repeat the sidebar. |

## Components And Interaction

| Component Type | Styling Direction |
|---|---|
| Header pills | Slim glass utility controls, not chunky cards |
| Dropdown menus | Flat, refined, glassy, minimal helper text |
| KPI cards | Compact, high contrast, no extra decoration that competes with the number |
| Section cards | Strong header, calm body, shallow nesting |
| Interactive rows | Flat list items with hover lift and soft accent border |
| Empty states | Guided and useful, not dead-end placeholders |

## Motion

| Rule | Guidance |
|---|---|
| Duration | Keep most transitions in the 150-300ms range. |
| Premium motion | Reserve slower 400-600ms movement for ambient background and larger shell effects. |
| Hover | Prefer slight lift, tint, or border change over dramatic scaling. |
| Background motion | Support atmosphere, never overpower content readability. |
| Accessibility | Respect `prefers-reduced-motion` on every page. |

## Content And Copy

| Rule | Guidance |
|---|---|
| Terminology | Use one canonical term per page and stick to it. |
| Headings | Be direct and task-oriented. |
| Helper text | Add only when the UI would otherwise be unclear. |
| Empty state copy | Explain why the section matters, what to do next, and where the CTA goes. |

## Implementation Rules

| Rule | Guidance |
|---|---|
| Tokens first | Use existing semantic tokens and PT/app surface classes before adding one-off colors. |
| Existing components | Reuse current cards, headers, empty states, and shells whenever possible. |
| Derived state | Compute view-model state instead of introducing avoidable UI state. |
| Responsiveness | Verify at 375px, 768px, 1024px, and 1440px. |
| Accessibility | Preserve heading order, keyboard access, contrast, and visible focus. |

## Anti-Patterns

| Avoid | Why |
|---|---|
| Bright white light mode | It collapses the glass system and cheapens the premium feel. |
| Nested bordered boxes everywhere | It makes dense product pages harder to scan. |
| Decorative pills without meaning | They create noise and weaken hierarchy. |
| Marketing hero blocks on operational pages | They delay action and hide real work. |
| Green-led light-theme branding | It conflicts with the mineral glass direction. |
| Overactive background motion | It fights the UI instead of supporting it. |

## Pre-Delivery Checklist

| Check | Pass Criteria |
|---|---|
| Contrast | All text and controls are readable in both themes. |
| Hierarchy | The main action area is obvious within 3 seconds. |
| Nesting | No unnecessary card-inside-card layering remains. |
| Pills | Every pill or badge adds meaning, not decoration only. |
| Motion | Motion feels premium, not distracting, and reduced-motion is honored. |
| Responsiveness | Layout holds at mobile, tablet, desktop, and wide desktop sizes. |
| Consistency | Typography, spacing, borders, and terminology match adjacent pages. |
