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
