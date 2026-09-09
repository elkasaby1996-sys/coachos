# RepSync component system

The application uses `src/styles/component-system.css` for shared component appearance. Page components own layout, data, and content. They should not introduce new card backgrounds, corner radii, shadows, control heights, or heading sizes.

| Component                | Shared convention                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Main cards               | `Card`, `DashboardCard`, `PtHubSectionCard`, or `SettingsSectionCard`; 20px corners, neutral surface, subtle shadow |
| Client portal cards      | `SurfaceCard`, `SurfaceCardHeader`, and `SurfaceCardContent` are aliases of the base card primitives                |
| Inset sections           | `Card variant="inset"` / `SectionCard`; 12px corners, quiet background, no shadow                                   |
| Card spacing             | 20px content padding (16px on mobile), 16px vertical header padding, consistent header divider                      |
| Card titles              | 16px, weight 600, shared heading font, foreground color                                                             |
| KPI cards                | `StatCard`; shared card frame with compact metric spacing and 24px values                                           |
| Buttons and fields       | 44px minimum height, 12px corners, consistent focus feedback                                                        |
| Status badges            | `Badge` / `StatusPill`; 12px text, natural casing, common pill padding; semantic colors preserved                   |
| Tabs                     | Shared tab rail and active state; 44px triggers, no vertical lift                                                   |
| Menus and dialogs        | 16px menu corners / 20px dialog corners, opaque themed surface, common overlay shadow                               |
| Empty states and notices | Shared inset shape; dashed empty states and explicit semantic notice tones                                          |
| Data tables              | `ui-table` for native tables; uniform cell spacing and row dividers                                                 |

Use `tone="danger"`, `"warning"`, `"success"`, or `"info"` on `Card` and `Alert` when color conveys a state. Do not recreate error styling with a custom card background.

For existing plain-element panels, `ui-panel` and `ui-inset` provide the same surfaces without changing markup, event handlers, or semantics. Prefer the React primitives for new components.

Avatars, status dots, media crops, charts, calendar cells, navigation rails, and the joined overview KPI strip retain shapes required by their role. Module accents remain available for navigation and icons; primary actions use one brand color, and main card surfaces and heading treatments are shared.

Run `node scripts/audit-ui-components.mjs` to inventory component usage and catch oversized custom corners on shared components. Verify representative populated, empty, error, disabled, and active states in light/dark themes and narrow layouts when changing these tokens.
