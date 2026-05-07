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
