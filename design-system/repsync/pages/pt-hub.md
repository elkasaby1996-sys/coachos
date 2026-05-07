# Repsync PT Hub Overrides

> This file refines the app-wide system for PT Hub pages.
> For all rules not listed here, follow `design-system/repsync/MASTER.md`.

## PT Hub Role

PT Hub is the coach-facing operating shell for Repsync.

It should feel:

- decisive
- premium
- efficient
- calm under high information density

## PT Hub Layout Rules

| Area | Rule |
|---|---|
| Sidebar | Use a strong glass rail with clear active states and minimal decoration. |
| Header | Keep the page title prominent, with slim utility pills for context and controls. |
| Content canvas | Use open spacing with one dominant module near the top. |
| Lower sections | Prefer flatter list rows and summary cards over deeply framed sub-panels. |

## PT Hub Visual Rules

| Topic | Guidance |
|---|---|
| Nav active state | Use surface tint, border, icon tint, and slight shift. Avoid extra decorative lines. |
| Header pills | Slim, refined, glass utility controls that match the shell. |
| Dropdowns | Soft portal surfaces with minimal helper text and light internal chrome. |
| Cards | Strong outer shells, flatter internals, and clear separators. |
| Metrics | Coach-centric, compact, and easy to compare quickly. |

## PT Hub Background Rules

| Theme | Guidance |
|---|---|
| Dark | Richer atmospheric motion is acceptable because content contrast remains high. |
| Light | Background must soften and recede so the glass UI remains the hero. |
| Both | The background should feel alive, but never look like a demo effect detached from the product. |

## PT Hub Page Recipe

| Section | Guidance |
|---|---|
| Top row | 3-4 compact metrics only |
| Primary module | Action center or highest-priority operational module |
| Secondary rail | Recent activity, guided checklist, or useful utility summary |
| Lower grid | Summary cards only when they add new information |

## PT Hub Copy Rules

| Rule | Guidance |
|---|---|
| Tone | Direct, coach-centric, and operational |
| Labels | Prefer action-oriented phrasing over generic platform status |
| Terminology | Use one canonical term per page; avoid mixing workspace terms casually |

## PT Hub Reusable Building Blocks

| Purpose | File |
|---|---|
| Shell layout | `src/components/layouts/pt-hub-layout.tsx` |
| Animated background | `src/features/pt-hub/components/pt-hub-animated-background.tsx` |
| Page header | `src/features/pt-hub/components/pt-hub-page-header.tsx` |
| Section card | `src/features/pt-hub/components/pt-hub-section-card.tsx` |
| Overview sections | `src/features/pt-hub/components/pt-hub-overview-sections.tsx` |

## PT Hub Avoid

| Avoid | Why |
|---|---|
| Large marketing hero blocks | PT Hub is a tool, not a landing page. |
| Repeated status counts across sections | It wastes attention and creates noise. |
| Bright light-mode surfaces | They flatten the shell and fight the background. |
| Helper text on every row | It reduces scan speed and makes the dashboard feel heavy. |
