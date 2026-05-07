# RepSync Style Guide

This app now uses **PT Hub** as the single visual source of truth.

## Global Theme Source

- Master file: `src/styles/style.css`
- Loaded globally from: `src/main.tsx`
- This file controls:
  - brand color tokens (`--accent`, `--bg-*`, `--text-*`, `--border-*`)
  - dark/light theme values
  - shell/background mood (`--shell-canvas`, panel shadows)
  - typography for body + headings
  - shared search/filter control styles

## Theme Rules

- `:root` defaults to PT Hub dark tokens.
- `.light` overrides with PT Hub light tokens.
- `.dark` (or default root state) uses PT Hub dark tokens.
- If you want to retheme the app later, update only `src/styles/style.css`.

## Unified Search + Filter Controls

Use these classes everywhere:

- Search wrapper: `app-search-shell` (optional helper)
- Search icon: `app-search-icon`
- Search input: `app-search-input`
- Small search input: `app-search-input-sm`
- Filter select/input style: `app-filter-control`
- Small filter style: `app-filter-control-sm`

## Implementation Standard

For any new page:

1. Use `Input` with `className="app-search-input"` for search fields.
2. Place a `Search` icon with `className="app-search-icon h-4 w-4"`.
3. Use `className="app-filter-control"` for in-page filter selects.
4. Keep page shells on theme tokens (`bg-*`, `surface-*`, `theme-shell-canvas`) instead of hard-coded colors.

## Mandatory UI Skill Workflow

For every UI/UX change in this app, always use `ui-ux-pro-max` before implementation.

Required steps:

1. Run `ui-ux-pro-max` with `--design-system`.
2. Apply its recommendations to layout, spacing, color, and interaction decisions.
3. Use additional domain lookups (`--domain ux`, `--domain style`, etc.) when needed.

Example:

```bash
python .codex/skills/ui-ux-pro-max/scripts/search.py "repsync <page> <ui task>" --design-system -p "RepSync"
```

## Notes

- PT Hub is the canonical visual language for the whole product.
- Avoid introducing one-off gradients, colors, or search input styles outside the shared classes.
