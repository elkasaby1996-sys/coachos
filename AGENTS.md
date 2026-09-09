# Agent Instructions

## UI/UX Work (Mandatory)

For any UI/UX change in this repository, always use the `ui-ux-pro-max` skill before implementation.

Required sequence:

1. Run the skill with `--design-system` for the specific page/task.
2. Implement using the returned guidance.
3. Run additional domain lookups (`--domain ux`, `--domain style`, etc.) when needed.

Example:

```bash
python .codex/skills/ui-ux-pro-max/scripts/search.py "repsync <page> <ui task>" --design-system -p "RepSync"
```

This rule applies to layout changes, spacing, typography, color/theme updates, interaction states, and component visual refactors.

## Analytics-style UI preferences

When reusing the light, teal-accented Analytics/Payments/Leads style, follow these user preferences:

- Do not add an eyebrow, tagline, or decorative text line above the page title.
- Do not add a decorative full stop to page or profile titles.
- Keep KPI/metric summaries text-only; do not add decorative metric icons.
- Keep useful descriptions beneath titles. Functional icons in search, navigation, and actions are still appropriate.

## Shared icon system

- Import interface icons from `src/lib/icons.tsx`, the shared Phosphor catalog.
- Reuse the same symbols for equivalent client and coach features. Navigation uses regular icons when inactive and duotone when active, at 20 px on desktop and 22 px in mobile navigation.
- Add new Phosphor symbols to that catalog using direct per-icon imports. Do not introduce another UI icon library or import Phosphor separately in pages.
- Preserve brand logos, charts, and anatomical illustrations as purpose-built graphics. Keep accessible labels on icon-only controls.

## Supabase Remote Safety (Mandatory)

Do not run remote Supabase commands unless the user explicitly asks to change a named remote project in the current turn.

Blocked without explicit user approval:

- `npx supabase@latest functions deploy ...`
- `npx supabase@latest functions delete ...`
- `npx supabase@latest secrets set ...`
- `npx supabase@latest secrets unset ...`
- `npx supabase@latest db push ...`
- `npx supabase@latest link ...`
- any migration command targeting a linked/remote project

Use local-only commands for development:

- `npm run supabase:start`
- `npm run supabase:migration:up`
- `npm run supabase:db:reset`
- `npm run supabase:db:lint`
- `npx supabase@latest functions serve ... --env-file <local-env-file>`

If a remote Supabase operation is intentionally required, use the guarded wrapper:

```bash
ALLOW_REMOTE_SUPABASE=I_UNDERSTAND_THIS_TOUCHES_REMOTE SUPABASE_PROJECT_REF=<project-ref> npm run supabase:remote -- <supabase args>
```

Never set local-only URLs such as `localhost`, `127.0.0.1`, or `host.docker.internal` as secrets on a remote Supabase project.
