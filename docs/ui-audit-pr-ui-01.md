# PR-UI-01.0 Systematic UI Audit and Design Rules

## Scope

This is an audit and planning document for beta UI alignment. It does not change permissions, routing, data model, RLS, assignment semantics, transfer/archive behavior, messaging architecture, or broad page layouts.

The audit covered representative coach, client, public, and historical relationship surfaces:

- PT Hub and workspace clients: `src/features/pt-hub/components/pt-hub-page-header.tsx`, `src/features/pt-hub/components/pt-hub-client-table.tsx`, `src/pages/pt/clients.tsx`
- Client detail and archived history: `src/pages/pt/client-detail.tsx`, `src/features/pt-client-onboarding/components/pt-client-onboarding-tab.tsx`
- Assignments, check-ins, nutrition, and builders: `src/pages/pt/checkin-templates.tsx`, `src/pages/pt/nutrition.tsx`, `src/pages/pt/programs.tsx`, `src/pages/pt/workout-template-builder.tsx`
- Messaging: `src/pages/client/messages.tsx`, `src/features/lead-chat/components/client-lead-dashboard.tsx`, `src/pages/pt/messages.tsx`
- Client portal and onboarding: `src/pages/client/home.tsx`, `src/pages/client/checkin.tsx`, `src/pages/client/baseline.tsx`, `src/pages/client/client-account-onboarding.tsx`
- Settings: `src/features/settings/components/settings-primitives.tsx`, `src/features/settings/hooks/use-dirty-navigation-guard.tsx`, `src/pages/workspace/settings/tabs/general.tsx`
- Public profile and lead capture: `src/features/pt-public/components/public-pt-profile-view.tsx`, `src/features/pt-public/components/public-pt-apply-form.tsx`

Baseline design references:

- `docs/repsync-ui-playbook.md`
- `design-system/repsync/MASTER.md`
- `design-system/repsync/pages/pt-hub.md`
- `ui-ux-pro-max` design-system lookup for RepSync systematic UI audit

## Current Strengths

- The repo already has useful primitives for the target direction: `DashboardCard`, `EmptyState`, `StatusPill`, `TagInfoBadge`, `LifecycleBadge`, `RiskBadge`, portal `SurfaceCard`, `SectionCard`, `StatusBanner`, `EmptyStateBlock`, and settings `StickySaveBar`.
- The PT Hub client list is a strong reference for dense responsive lists. `src/features/pt-hub/components/pt-hub-client-table.tsx` uses desktop grid rows, mobile stacked rows, relationship badges, lifecycle/risk badges, and a single explicit row action.
- Historical client relationships have correct behavioral gating in `src/pages/pt/client-detail.tsx`: primary mutation actions are hidden or disabled for `removed` and `transferred_out`, and the page shows a historical relationship alert.
- Settings already has the best form-save pattern through `useDirtyNavigationGuard` and `StickySaveBar`.
- Client portal surfaces are more consistent than older PT builder pages because they share `PortalPageHeader`, `SurfaceCard`, and `SectionCard`.

## Major Inconsistencies

### 1. Page Headers

There are three active header patterns:

- `src/features/pt-hub/components/pt-hub-page-header.tsx`
- `src/components/pt/workspace-page-header.tsx`
- `src/components/client/portal/portal-ui.tsx` (`PortalPageHeader`)

They solve similar problems but differ in surface treatment, title sizing, shell-mode behavior, action layout, and spacing. PT Hub pages can render a full accent shell, workspace pages are flatter, and client pages use a portal border pattern. The difference is acceptable by audience, but rules are needed so new pages do not invent a fourth header model.

### 2. Card and Action Layouts

Shared primitives exist, but many important pages still assemble cards ad hoc:

- `src/pages/pt/client-detail.tsx` mixes `DashboardCard`, raw `Card`, inline stat blocks, dialogs, and one-off action rows.
- `src/pages/pt/nutrition.tsx` uses `WorkspacePageHeader`, `SaveActions`, raw cards, `StatusPill`, and `Badge`.
- `src/pages/pt/programs.tsx` uses raw cards and local create/delete flows.
- `src/pages/pt/workout-template-builder.tsx` uses raw cards, inline empty text, inline error boxes, and builder-specific action rows.
- `src/pages/client/home.tsx` uses consistent portal cards, but includes nested `SurfaceCard` to `SectionCard` compositions that should stay functional and not become a decorative pattern everywhere.

The practical issue is not that all cards look different; it is that action placement is inconsistent. Primary actions appear in page headers, card headers, card footers, inline rows, dropdown menus, and native confirm callbacks without a single hierarchy.

### 3. Destructive Actions

The product already has app-dialog patterns in client messages and settings, but several high-impact PT actions still use native confirms:

- `src/pages/pt/client-detail.tsx`: workout override, pause program, switch program, unassign program, nutrition assignment removal
- `src/pages/pt/client-detail-tabs/pt-client-notes-tab.tsx`: delete note
- `src/pages/pt/calendar.tsx`: delete event
- `src/pages/pt/nutrition.tsx`: delete nutrition program
- `src/pages/pt/programs.tsx`: delete program
- `src/pages/pt/settings-baseline.tsx`: delete performance marker

This creates uneven risk communication, inconsistent button order, and inconsistent accessibility. `src/pages/client/messages.tsx` and `src/pages/workspace/settings/tabs/danger.tsx` are better references because they use app dialogs.

### 4. Empty, Loading, and Error States

There are good primitives:

- `src/components/ui/coachos/empty-state.tsx`
- `src/components/client/portal/portal-ui.tsx` (`EmptyStateBlock`)
- `Skeleton` from `src/components/ui/skeleton.tsx`
- `Alert` from `src/components/ui/alert.tsx`

But usage is uneven:

- `src/features/lead-chat/components/client-lead-dashboard.tsx` uses plain "Loading lead conversations..." and "Loading messages..." text.
- `src/pages/pt/workout-template-builder.tsx` has inline empty text such as "No exercises yet. Add one to start building this template." and inline error boxes.
- `src/pages/pt/client-detail.tsx` mixes skeletons, `EmptyState`, raw dashed empty boxes, and inline destructive/error copy across tabs and dialogs.
- `src/pages/client/checkin.tsx` mixes `DashboardCard`, portal cards, `EmptyState`, `SectionCard`, and plain "No active assignments yet." rows.

The result is functional, but the product feels assembled from different UI eras.

### 5. Badge and Status Semantics

The repo has both generic badge variants and semantic status primitives:

- `src/components/ui/badge.tsx`
- `src/components/ui/coachos/status-pill.tsx`
- `src/features/pt-hub/components/pt-hub-client-table.tsx`

Current mapping is mostly sensible, but not centralized enough. Examples:

- Relationship badges in `PtHubClientTable` map `removed` to warning and `transferred_out` to info.
- Client detail uses historical copy and alerts for ended relationships.
- Client messages show `Read-only` as muted and `Open` as neutral.
- Builder pages often use `Badge variant="muted"`, `secondary`, `warning`, or `success` without an obvious shared status taxonomy.

Follow-up should preserve existing behavior but centralize the visual mapping so `active`, `paused`, `removed`, `transferred_out`, `submitted`, `reviewed`, `overdue`, `assigned`, `draft`, `archived`, and `read-only` do not drift.

### 6. Historical and Archived Relationship UI

`src/pages/pt/client-detail.tsx` is the best source of truth for historical state. It distinguishes:

- `removed`: historical, can be reactivated through same-workspace invite/re-add
- `transferred_out`: historical, not reactivated by generic invite

The current detail page correctly hides primary mutation actions and shows a warning alert, while `PtHubClientTable` shows relationship badges in lists. The remaining UI gap is consistency across every historical sub-surface: onboarding snapshots, baseline photos, notes, logs, messages, assignments, and tab-level action rows should all communicate "history is available, delivery mutations are locked" in the same visual language.

### 7. Assignment Snapshot Warnings

Assignment semantics are implemented in `src/lib/assignment-semantics.ts` and used in:

- `src/pages/pt/client-detail.tsx`
- `src/pages/pt/nutrition-template-builder.tsx`
- `src/pages/pt/checkin-templates.tsx`

The copy is directionally clear: workouts and nutrition are snapshots, while check-ins are cadence settings. The UI treatment is not yet standardized. `AssignmentSnapshotCallout` in client detail and nutrition template builder is a good start, but builder pages and assignment cards need one shared warning pattern with consistent tone, placement, and action copy.

### 8. Forms, Save, and Dirty State

Settings is ahead of the rest:

- `src/features/settings/hooks/use-dirty-navigation-guard.tsx`
- `src/features/settings/components/settings-primitives.tsx`
- `src/pages/workspace/settings/tabs/general.tsx`

Builder pages use local save states, local error boxes, and sometimes page-header save buttons:

- `src/pages/pt/checkin-templates.tsx`
- `src/pages/pt/nutrition.tsx`
- `src/pages/pt/workout-template-builder.tsx`

The product needs one save-state language: dirty badge, sticky or scoped save bar, disabled saving button with spinner/copy, inline field errors, page-level error alert, and consistent discard behavior.

### 9. Table/List Density and Mobile

`src/features/pt-hub/components/pt-hub-client-table.tsx` is the strongest current pattern: dense desktop rows and stacked mobile cards. Other lists and builders should follow the same density logic instead of using wide card grids or overflowing rows by default.

Priority mobile review targets:

- `src/pages/pt/client-detail.tsx`
- `src/pages/pt/workout-template-builder.tsx`
- `src/pages/pt/checkin-templates.tsx`
- `src/pages/pt/nutrition.tsx`
- `src/pages/client/checkin.tsx`
- `src/pages/client/messages.tsx`
- `src/features/pt-public/components/public-pt-profile-view.tsx`

### 10. Coach, Client, and Public Visual Consistency

The audiences should remain distinct:

- Coach/PT surfaces: dense, operational, action-first, high information density.
- Client portal: calmer, task-focused, less dense, more progress-oriented.
- Public profile/lead pages: polished and trust-building, but not marketing-heavy inside the product shell.

The inconsistency today is not brand direction; it is primitive drift. Coach pages sometimes use older raw cards while client pages use portal primitives. Public profile uses a bespoke visual language that is appropriate, but its form states and badges should still share the same status/empty/error rules.

## Proposed UI Rules

### Page Header Pattern

- Use exactly one page-level header primitive per shell.
- PT Hub/workspace pages should use PT header primitives with title, one-sentence operational description, optional small status/action cluster, and no decorative extra card when the shell already provides context.
- Client portal pages should use `PortalPageHeader`.
- Header actions should be limited to one primary action, one secondary action, and an overflow menu when more actions exist.
- Page headers should not carry destructive actions directly; destructive actions belong in overflow menus or contextual cards with confirmation dialogs.

### Card Action Hierarchy

- Primary page action: top-right page header.
- Primary card action: top-right card header when it changes that card's subject.
- Secondary card actions: card footer or inline action row.
- Destructive actions: overflow menu or dedicated danger row with app dialog.
- Avoid placing competing primary buttons in both the page header and first card.
- Avoid nested cards as decoration. Use nested sections only for functional grouping inside dense client/coach surfaces.

### Status Badge Mapping

Use semantic status primitives before raw badges:

- `active`, `completed`, `reviewed`, `success`: success
- `open`, `submitted`, `in_progress`, `info`: info
- `pending`, `paused`, `overdue_attention`, `removed`: warning
- `at_risk`, `failed`, `blocked`, `destructive`: danger
- `archived`, `read-only`, `draft`, `not assigned`, `inactive`: muted/neutral
- `transferred_out`: info with historical explanation

Relationship status badges must include explanation affordance when space allows:

- `removed`: "Removed relationship", history preserved, reinvite can reactivate.
- `transferred_out`: "Transferred-out relationship", history preserved, generic invite does not reactivate.

### Empty State Structure

Every empty state should include:

- Specific title
- One sentence explaining why the area is empty
- Optional next action when the user can resolve it
- No action when the state is intentionally blocked or read-only

Use `EmptyState` in coach/dashboard surfaces and `EmptyStateBlock` in portal surfaces. Avoid plain "No data yet" text except inside tiny table cells.

### Loading State Structure

- Use skeletons that approximate the final layout for cards, tables, and lists.
- Use a loading button state for button-triggered saves or destructive actions.
- Avoid standalone "Loading..." text in card bodies unless the region is very small.
- Use consistent skeleton heights for rows: compact list rows around 64-80px, cards around their final card height.

### Error State Structure

- Field validation errors belong next to the field.
- Page/query failures use `Alert` with a short title, user-safe message, and retry action when available.
- Dialog operation failures stay inside the dialog above the footer actions.
- Avoid dumping raw Supabase codes unless the page is explicitly an internal/admin diagnostic surface.

### Destructive Action Pattern

- Replace native confirms with `AlertDialog` or the existing app dialog primitive.
- Dialog copy should state the object, impact, and whether history is preserved.
- Button order: cancel/secondary first, destructive confirm last.
- Destructive confirm button uses destructive styling and a saving/removing state.
- Never delete or unassign from an inline text-only browser confirm.

### Read-only/Historical State Pattern

- Ended relationships get a persistent status banner near the detail header.
- Mutating controls are hidden when not useful, disabled with reason when context is useful, or moved behind a read-only explanatory row.
- Historical views should prefer "history preserved" language over "disabled".
- `removed` and `transferred_out` must stay visually distinct because their reactivation rules differ.
- Assignment/history tabs should keep data visible but expose a consistent lock/read-only explanation before the first disabled action.

### Assignment Card Pattern

- Current assignment cards should show: status badge, source/template name, effective date/cadence, client impact, and primary next action.
- Snapshot-based assignments must include the shared snapshot warning near the assignment controls.
- Cadence-based assignments, like check-ins, should use a distinct "cadence settings" hint instead of snapshot warning copy.
- Remove/unassign actions should live in a subdued danger row with app-dialog confirmation.

### Form Save and Dirty-State Pattern

- Use settings `StickySaveBar`/dirty guard behavior as the model for multi-field forms.
- Show an `Unsaved changes` badge only when there is a real dirty state.
- Save buttons use "Saving..." or spinner state and are disabled while saving.
- Discard is always available when dirty unless unsafe.
- Navigation away from dirty forms should use the shared dirty navigation guard.

### List Density and Responsive Pattern

- Desktop operational lists use compact rows and stable action columns.
- Mobile lists convert to stacked cards with the primary row action at the bottom.
- Tables that can overflow must have an intentional responsive treatment, not accidental horizontal scrolling.
- Filters should collapse to one column on mobile and keep primary search first.

## Recommended PR Split

1. **PR-UI-01.1 shared card/action layout primitives**
   - Define a small action hierarchy wrapper for card headers, footers, overflow actions, and danger rows.
   - Start with PT builder/client-detail cards where action drift is highest.

2. **PR-UI-01.2 assignment and check-in card polish**
   - Standardize current assignment cards, snapshot warnings, cadence hints, and unassign rows.
   - Target `src/pages/pt/client-detail.tsx`, `src/pages/pt/checkin-templates.tsx`, and nutrition/workout assignment surfaces.

3. **PR-UI-01.3 empty/loading/error state system**
   - Replace inline loading/error/empty text with the existing primitives.
   - Target lead chat, workout builder, client check-in, nutrition, and client detail tabs.

4. **PR-UI-01.4 form/save/dirty-state consistency**
   - Bring builder pages closer to settings save behavior.
   - Target `checkin-templates`, `nutrition`, and workout template builder.

5. **PR-UI-01.5 badge/status consistency**
   - Centralize status-to-variant mapping and relationship badge copy.
   - Update PT/client/public surfaces without changing behavior.

6. **PR-UI-01.6 nutrition builder UI parity**
   - Align nutrition templates and nutrition assignment cards with workout/program builder patterns.

7. **PR-UI-01.7 mobile/responsive pass**
   - Validate 375, 768, 1024, and 1440 widths for dense pages.
   - Prioritize client detail, builders, check-ins, messaging, and public profile.

8. **PR-UI-01.8 final UI regression sweep**
   - Cross-surface QA for active client, archived client, transferred client, coach admin, coach member, client, no-active-workspace, and public lead flows.

9. **PR-UI-01.9 replace native confirms with app dialogs**
   - Replace the native confirms listed above with consistent `AlertDialog` flows.
   - This can move earlier if beta QA flags destructive-action polish as a trust blocker.

## Highest-Priority Next PR

Recommended next: **PR-UI-01.3 empty/loading/error state system**.

Reason: it is high visibility, low semantic risk, and touches every beta workflow without needing broad layout redesign. It will make the product feel more coherent immediately while preserving the hardened functional behavior.

Close second: **PR-UI-01.9 replace native confirms with app dialogs**, because native confirms appear in destructive PT actions that affect client delivery and history.

## PR-UI Follow-up Acceptance Checklist

- No functional semantics changed unless the PR explicitly requests it.
- Existing permissions, RLS assumptions, routing, assignment semantics, transfer/archive behavior, and messaging architecture remain unchanged.
- Each page uses one shell-appropriate page header.
- Primary, secondary, overflow, and destructive actions follow the action hierarchy.
- Empty/loading/error states use shared primitives.
- Status badges use the shared semantic mapping.
- Historical relationships show consistent read-only/history-preserved copy.
- Mobile layouts are checked at 375px and 768px.
- Lint and build pass.

