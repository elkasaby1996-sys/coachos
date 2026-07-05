# PR-UI-01.5A.0 Lifecycle / Relationship / Risk Tag Audit

This is an audit and planning document only. It does not propose renaming stored values, changing filters, changing lifecycle or risk calculations, changing relationship semantics, or changing RLS.

## 1. Current Status Taxonomy Inventory

RepSync currently uses several overlapping status families:

| Family | Current values observed | Purpose today | Primary references |
| --- | --- | --- | --- |
| Relationship status | `active`, `removed`, `transferred_out` | Access, historical/read-only relationship state, transfer/reactivation semantics | `src/pages/pt/client-detail.tsx`, `src/features/pt-hub/lib/pt-hub.ts`, `src/lib/auth.tsx`, `src/lib/client-profile-selection.ts` |
| Coaching lifecycle | `invited`, `onboarding`, `active`, `paused`, `completed`, `churned`, plus `unknown` display fallback | Coach-facing lifecycle journey | `src/lib/client-lifecycle.ts`, `src/components/ui/coachos/status-pill.tsx`, `src/features/pt-hub/components/pt-hub-client-table.tsx`, `src/pages/pt/client-detail.tsx` |
| Risk state | `healthy`, `at_risk` | High-level attention state for coach | `src/lib/client-lifecycle.ts`, `RiskBadge`, `src/features/pt-hub/components/pt-hub-client-table.tsx` |
| Risk flags | `missed_checkins`, `no_recent_reply`, `low_adherence_trend`, `inactive_client` | Specific coach-action signals | `src/lib/client-lifecycle.ts`, PT Hub table, client detail header |
| PT Hub client segments | `all`, `onboarding_incomplete`, `checkin_overdue`, `at_risk`, `paused` | Filters/navigation segments; partly derived from risk/lifecycle/check-ins | `src/lib/client-lifecycle.ts`, `src/pages/pt-hub/clients.tsx`, `src/pages/pt/clients.tsx` |
| Client onboarding status | `invited`, `in_progress`, `submitted`, `review_needed`, `partially_activated`, `completed` | Workspace onboarding workflow | `src/features/client-onboarding/types.ts`, `src/features/client-onboarding/lib/client-onboarding.ts`, `src/components/common/client-reminders.tsx`, client onboarding shell |
| Check-in operational status | `upcoming`, `due`, `overdue`, `submitted`, `reviewed`; client page also maps `due` to open state | Check-in workflow state | `src/lib/checkin-review.ts`, `src/lib/client-checkin-state.ts`, `src/pages/client/checkin.tsx`, `src/pages/pt/client-detail.tsx` |
| Lead status | `new`, `contacted`, `approved_pending_workspace`, `converted`, `declined`; older baseline schema also references legacy values such as `reviewed`, `consultation_booked`, `accepted`, `rejected`, `archived` | Lead pipeline workflow | `src/features/pt-hub/types.ts`, `src/features/pt-hub/components/pt-hub-lead-status-badge.tsx`, `src/pages/pt-hub/leads.tsx` |
| Delivery/assignment status | Workout: `planned`, `in_progress`, `completed`, `skipped`, `rest`; Nutrition: `active`, `completed`, `cancelled`; Program/check-in assignment states such as assigned/not assigned | Domain-specific workflow state | `src/pages/pt/client-detail.tsx`, `src/pages/client/home.tsx`, `src/pages/client/checkin.tsx`, migrations |
| Library/package/template status | `active`, `inactive`, `archived`, package `draft`, `active`, `archived` | Library and commerce workflow state | `src/pages/pt/programs.tsx`, `src/pages/pt/nutrition.tsx`, `src/pages/pt-hub/packages`, `src/features/pt-hub/types.ts` |
| Generic status pill fallback | `pending`, `submitted`, `review_needed`, `partially_activated`, `rest`, `recovery`, `upcoming`, `reviewed`, `not logged`, plus any string formatted dynamically | Visual fallback for many unrelated concepts | `src/components/ui/coachos/status-pill.tsx`, `src/lib/semantic-status.ts` |

## 2. Stored vs Computed Status Map

| Value/source | Stored or computed | Notes |
| --- | --- | --- |
| `clients.relationship_status` | Stored | Locked semantics: `active`, `removed`, `transferred_out`. Controls active vs historical/read-only behavior. |
| `clients.lifecycle_state` | Stored | Normalized by `client-lifecycle.ts`; used for filters and lifecycle badges. |
| `clients.manual_risk_flag` | Stored | Manual coach override for at-risk state. |
| `clients.status` | Stored legacy/general client status | Still mapped into `PTClientSummary.status`, but product meaning is less clear than `relationship_status` and `lifecycle_state`. |
| `workspace_client_onboardings.status` | Stored | Client onboarding workflow status. Labels are client-facing in onboarding and coach-facing in PT surfaces. |
| `checkins.submitted_at` / `reviewed_at` + due date | Stored timestamps, computed state | `getCheckinOperationalState` computes `upcoming`, `due`, `overdue`, `submitted`, `reviewed`. |
| `assigned_workouts.status` and `day_type` | Stored | Domain workflow; used in client workouts, PT plan views, logs. |
| `assigned_nutrition_plans.status` | Stored | `active`, `completed`, `cancelled`; current views query active only. |
| `client_programs.is_active` / program assignment records | Stored booleans/rows | UI maps to active, paused, not assigned, assigned. |
| `pt_hub_leads.status` | Stored | PT lead workflow status; should stay inside lead surfaces. |
| `PTClientSummary.riskFlags` | Computed upstream/query summary | Includes `missed_checkins`, `no_recent_reply`, `low_adherence_trend`, `inactive_client`; displayed as individual risk chips in some surfaces. |
| `PTClientSummary.hasOverdueCheckin` / `overdueCheckinsCount` | Computed summary | Used for PT Hub table badges, filters, analytics. |
| `PTClientSummary.onboardingIncomplete` | Computed summary | Used as segment filter and sometimes a badge. |
| `getClientRiskState` | Computed frontend | Returns `at_risk` if manual flag or any normalized risk flag exists; otherwise `healthy`. |
| `matchesClientSegment` | Computed frontend | Keeps filter semantics for onboarding incomplete, overdue check-ins, at risk, paused. |
| `StatusPill` fallback labels/tones | Computed frontend | Converts arbitrary strings into labels and semantic tones; useful but also enables taxonomy drift. |

## 3. Surface-by-Surface Badge Usage

### Shared primitives

- `src/components/ui/coachos/status-pill.tsx`
  - `StatusPill` accepts any string and maps many unrelated states through one generic map.
  - `LifecycleBadge` wraps lifecycle meta from `src/lib/client-lifecycle.ts`.
  - `RiskBadge` wraps the computed high-level risk state.
  - `TagInfoBadge` creates interactive explanatory badges and is reused for relationship, onboarding, risk flags, and check-in signals.

### PT Hub client table

- `src/features/pt-hub/components/pt-hub-client-table.tsx`
  - Builds a prioritized `statusBadges` array from relationship, lifecycle, high-level risk, onboarding status, overdue check-ins, and individual risk flags.
  - Sorts and slices to two visible badges.
  - Relationship badge is only present for `removed` and `transferred_out`.
  - Active clients can show lifecycle plus risk, onboarding, overdue, or risk-flag chips.
  - Ended relationships can still include lifecycle and risk candidates before slice/priority, which can make historical rows feel active.

### PT Hub clients page and workspace clients page

- `src/pages/pt-hub/clients.tsx`
  - KPI cards show Total, Active, At Risk, Paused.
  - Filters expose lifecycle values and segment values.
  - Table rows are delegated to `PtHubClientTable`.
- `src/pages/pt/clients.tsx`
  - Adds an Active/Archived relationship view toggle.
  - Still exposes lifecycle and segment filters in both views.
  - Uses the same `PtHubClientTable`, so row badge behavior is shared.
- `src/components/pt/clients/ClientListRow.tsx`
  - Older row pattern shows a lifecycle badge beside the client name and next coach move. If this component remains in use, it should follow the same one-lifecycle-badge rule.

### Client detail

- `src/pages/pt/client-detail.tsx`
  - Header stacks `LifecycleBadge`, `RiskBadge`, onboarding `TagInfoBadge`, Attention button, and up to two risk flag badges.
  - The overview block repeats Lifecycle, Onboarding, and Risk in separate `ops-stat` cards.
  - Historical/read-only state uses a banner, but lifecycle/risk/onboarding can still appear near the top unless intentionally suppressed/framed.
  - Domain tabs add many `StatusPill` instances for assignments, check-ins, workout status, nutrition assignment, logs, and session state.
  - Good separation exists in many domain cards; the issue is primarily duplication between global header, overview, and domain cards.

### Archived/transferred-out UI

- `src/pages/pt/clients.tsx`
  - Archived view is controlled by `relationshipScope`/view param and copy says removed or transferred-out relationships appear there.
- `src/pages/pt/client-detail.tsx`
  - `isHistoricalClientRelationship` is derived from `removed` or `transferred_out`.
  - Historical banner is strong and copy is explicit.
  - Active actions are gated, but active-coaching badges still risk appearing in header/overview as if current.

### Client portal

- `src/pages/client/home.tsx`
  - Uses user-facing copy and status banners, including "You do not currently have an active coaching workspace."
  - Badges mainly describe training plan availability, source/workspace labels, and workout/nutrition domain state.
  - Does not expose PT lifecycle/risk tags directly.
- `src/pages/client/checkin.tsx`
  - Uses a local check-in `statusMap` for `active`/in progress, `upcoming`, `submitted`, `due`, `overdue`, `reviewed`.
  - Client-facing labels are appropriate because they describe the current check-in task.
  - Some repeated status pills in assignment lists and submitted/reviewed sections are domain-specific and should remain local.
- `src/components/layouts/client-layout.tsx`
  - Onboarding banner uses friendly copy such as "Onboarding with coach" and progress messaging.
- `src/components/common/client-reminders.tsx`
  - Converts onboarding/check-in states into reminder actions: finish onboarding, check-in overdue, check-in due.

### Lead/onboarding surfaces

- `src/features/pt-hub/components/pt-hub-lead-status-badge.tsx`
  - Lead workflow badges are isolated to lead surfaces and should remain there.
- `src/pages/pt-hub/leads.tsx`
  - Lead row combines lead status, unread count, and status action such as mark contacted.
- `src/features/client-onboarding/lib/client-onboarding.ts`
  - Maps onboarding statuses to labels: Not started, In progress, Awaiting PT review, Reviewed by coach, Completed.
- `src/features/client-onboarding/components/client-onboarding-shell.tsx`
  - Header can show status, percent complete, last saved, saved/read-only/required/optional badges. These are workflow-local and client-facing.

### Dashboard analytics/client health

- `src/pages/pt-hub/analytics.tsx`
  - "Client risk and delivery health" shows at-risk clients, overdue check-ins, paused in range, churned in range as metrics that navigate to filtered client lists.
  - This is a good pattern: high-level metrics are actionable without row-level badge clutter.
- `src/pages/pt-hub/overview.tsx`
  - Client summary cards surface onboarding gaps, overdue check-ins, and risk signals as dashboard work queues.
- `src/pages/pt/dashboard.tsx`
  - Computes attention labels such as Manual at-risk flag, Onboarding review, Check-in overdue, Long idle gap, Adherence low, and next action labels.
  - This is close to the proposed "one action signal" model, but it is not shared with PT Hub table taxonomy yet.
- `src/pages/pt/messages.tsx`
  - Client list and selected conversation display lifecycle labels/badges in a messaging context, where lifecycle is secondary and can become noise.

## 4. Clutter Examples with File References

1. `src/features/pt-hub/components/pt-hub-client-table.tsx`
   - A single row may evaluate relationship, lifecycle, risk, onboarding status, overdue check-ins, and every risk flag. It then slices to two badges, which hides some signals while preserving the underlying complexity.

2. `src/pages/pt/client-detail.tsx`
   - Header shows lifecycle, risk, onboarding, attention, and individual risk flags.
   - The first overview surface repeats lifecycle, onboarding, and risk immediately below the header.

3. `src/pages/pt/clients.tsx`
   - Archived view uses relationship scope but still exposes lifecycle and segment filters. This can imply active coaching concepts apply to historical rows.

4. `src/pages/pt/dashboard.tsx`
   - Attention labels combine onboarding, check-in state, inactivity, manual risk, lifecycle review, and adherence. This is useful, but labels are locally computed rather than part of a central attention taxonomy.

5. `src/pages/pt/messages.tsx`
   - Lifecycle labels appear in conversation selection. In messaging, lifecycle should usually be secondary context or hidden unless it changes what the coach can do.

6. `src/components/ui/coachos/status-pill.tsx`
   - Generic `StatusPill` includes lifecycle, workflow, check-in, assignment, rest-day, and fallback statuses in one map. This makes it easy to introduce visually similar badges for different concepts.

## 5. Proposed Simplified Taxonomy

### A. Relationship status

Values:
- `active`
- `removed`
- `transferred_out`

Purpose:
- Access, reactivation path, and historical/read-only state.

Display rule:
- Only show globally when not active.
- For active relationships, relationship status is implicit.
- For historical rows/details, relationship badge or banner is primary and should suppress active-coaching badges.

### B. Coaching lifecycle

Values:
- `invited`
- `onboarding`
- `active`
- `paused`
- `completed`
- `churned`

Purpose:
- Coach-facing journey state.

Display rule:
- Show at most one lifecycle badge in global client rows.
- In client detail, show lifecycle in one structured state area, not both header and first card.
- Suppress or frame as historical for `removed` and `transferred_out`.

### C. Attention/risk

Values/signals:
- High-level: `at_risk`
- Specific signals: `missed_checkins` / overdue check-in, `no_recent_reply`, `low_adherence_trend`, `inactive_client`

Purpose:
- Coach action needed.

Display rule:
- Show only if actionable.
- Prefer one "Attention" badge/chip in global rows, with the most important reason in copy or tooltip.
- Detail pages can show individual signals in a dedicated Attention section or dialog, not all in the header.

### D. Workflow/domain status

Examples:
- Check-in: `due`, `overdue`, `submitted`, `reviewed`, `upcoming`
- Lead: `new`, `contacted`, `approved_pending_workspace`, `converted`, `declined`
- Assignment: assigned/not assigned, active/paused program, active nutrition plan
- Package/template: draft/active/archived/inactive

Purpose:
- Only within the relevant domain surface.

Display rule:
- Do not show workflow/domain badges in global client rows unless the row is specifically about that workflow.
- Keep client-facing domain statuses in client app where they help the client act.

## 6. Proposed Display Rules

### Client list / PT Hub

- Active relationship clients:
  - Show maximum one lifecycle badge.
  - Show one attention badge only when actionable.
  - Do not show onboarding/check-in/risk-flag badges as separate global chips; use a single attention summary.
  - Preserve lifecycle and segment filters even if the badge is hidden.

- Ended relationship clients:
  - Show only relationship badge (`Removed` or `Transferred out`) as the primary badge.
  - Suppress current risk/lifecycle badges unless explicitly labeled as historical context.
  - Disable or hide segment filters that imply active work in archived view, or keep them as filters with clarified labels.

### Client detail header

- Show compact structured state:
  - Relationship: only if removed/transferred out, otherwise implicit.
  - Lifecycle: one badge/value.
  - Attention: one indicator only if actionable.
- Move individual risk flags into the attention dialog or first detailed status section.
- Avoid repeating lifecycle/onboarding/risk in both header and overview.

### Client app

- Do not expose internal PT lifecycle/risk labels.
- Use user-facing copy:
  - "Your coach is setting up your workspace."
  - "Your check-in is due."
  - "You do not currently have an active coaching workspace."
- Keep check-in/workout/nutrition statuses where they directly guide client action.

### Archived detail

- Relationship badge and historical banner are primary.
- Do not imply active coaching.
- Hide at-risk badge by default; if kept, label as "Historical attention signals" and avoid danger styling that suggests current urgency.

## 7. Filter Compatibility Notes

- Keep `lifecycle` filters exactly as values are today: `invited`, `onboarding`, `paused`, `active`, `completed`, `churned`.
- Keep segment filters: `onboarding_incomplete`, `checkin_overdue`, `at_risk`, `paused`.
- Do not rename `risk_flags`; only change how they display.
- Do not remove archived view relationship scope.
- If UI hides a badge, filters should still work because filtering is data/query behavior, not badge visibility.
- If archived view keeps active-work filters, add copy clarifying filters apply to stored historical lifecycle/segments.

## 8. Archived / Historical Behavior Notes

- Locked behavior is already represented:
  - `removed` can reactivate through same-workspace invite/re-add.
  - `transferred_out` can reactivate only through explicit transfer.
  - Historical relationships are read-only in client detail.
- The strongest current pattern is the client detail historical banner.
- The weak point is badge suppression: lifecycle/risk/onboarding badges can still visually compete with the historical banner.
- Proposed rule: relationship state wins over lifecycle/risk globally. Historical rows get relationship badge first and active work badges hidden.

## 9. Client-Facing Versus Coach-Facing Labels

Coach-facing only:
- Lifecycle: invited, onboarding, active, paused, completed, churned.
- Risk state: at risk, healthy.
- Risk flags: no recent reply, low adherence trend, inactive client, missed check-ins.
- Relationship state: removed, transferred out, archived/historical.

Client-facing allowed:
- Check-in due/overdue/submitted/reviewed/upcoming.
- Workout planned/completed/rest/recovery where relevant.
- Nutrition active/current plan copy.
- Onboarding progress, submitted, reviewed by coach, complete.
- Workspace state copy in plain language, not internal relationship labels.

Ambiguous or duplicative labels:
- `active` can mean active relationship, active lifecycle, active package/template, active nutrition plan.
- `onboarding` can mean lifecycle or workspace onboarding workflow.
- `submitted` can mean onboarding submitted, check-in submitted, baseline submitted, or lead submitted.
- `review_needed` and "Awaiting PT review" overlap with "Submitted".
- `at_risk`, "Attention", risk flags, and dashboard attention labels all point to coach action but are not centralized.
- `paused` is lifecycle, but also appears as a filter/segment and analytics metric.

## 10. Implementation PR Plan

### PR-UI-01.5A.1: Central badge taxonomy helpers only

- Add helper types for display layers:
  - relationship display state
  - lifecycle display state
  - attention summary display state
  - workflow/domain display state
- Add a single function that returns the primary global client row badges without changing filters.
- Add contract tests for active vs historical relationship display priority.

### PR-UI-01.5A.2: PT Hub client table + workspace clients list cleanup

- Apply helper to `PtHubClientTable`.
- Active rows: max one lifecycle and one attention badge.
- Archived rows: relationship badge only, with optional historical context copy.
- Preserve lifecycle and segment filters.

### PR-UI-01.5A.3: Client detail header/status cleanup

- Create a compact structured state block for Relationship / Lifecycle / Attention.
- Remove duplicate lifecycle/onboarding/risk badges from either the header or overview.
- Move individual risk flags into the attention dialog/detail region.

### PR-UI-01.5A.4: Archived/historical badge consistency

- Ensure archived/transferred-out detail and archived list rows suppress active-coaching risk/lifecycle urgency.
- Keep historical banner and read-only assignment states.
- Add regression tests for removed/transferred-out badge suppression.

### PR-UI-01.5A.5: Client portal tag minimization

- Ensure client app does not surface PT lifecycle/risk/relationship labels.
- Keep check-in, workout, nutrition, onboarding task statuses that are useful to clients.
- Replace any internal labels with user-facing copy if found during implementation.

### PR-UI-01.5A.6: Final badge/status regression

- Add source or render tests covering:
  - PT Hub active row max badge policy.
  - PT Hub historical row relationship-priority policy.
  - Client detail no duplicate global state badges.
  - Client portal no internal PT lifecycle/risk labels.
  - Filters still accept existing lifecycle/segment values.

## 11. Risks / Migration Notes

- Do not change database values or existing query filters.
- Generic `StatusPill` is heavily reused. Replacing it globally would be risky; introduce scoped helpers first.
- Some analytics and dashboard labels are useful but locally computed. Centralizing too much at once may create behavior drift.
- Hidden badges can make users think filters changed. Use microcopy or selected filter chips to show active filters even when badges are suppressed.
- Historical rows need special care: suppressing active risk badges should not hide important historical context in detail pages.
- Client-facing copy should remain plain language; avoid exposing `removed`, `transferred_out`, `at_risk`, or `churned` to clients.

## 12. Test Plan

- Unit/source contract tests:
  - Stored lifecycle values are unchanged.
  - Segment filters keep `onboarding_incomplete`, `checkin_overdue`, `at_risk`, `paused`.
  - Relationship statuses remain `active`, `removed`, `transferred_out`.
  - PT Hub row helper returns at most two global badges for active rows.
  - Historical rows return relationship badge and suppress active attention badges.
  - Client portal pages do not render coach-only lifecycle/risk labels.

- Render tests where coverage already exists:
  - PT Hub client table active row with lifecycle + risk.
  - PT Hub archived row with removed/transferred-out.
  - Client detail active vs historical header.
  - Client check-in domain statuses remain visible.

- Manual QA:
  - PT Hub clients with active, onboarding, paused, at-risk, overdue, removed, and transferred-out clients.
  - Workspace clients active and archived views.
  - Client detail active and historical relationships.
  - Client portal home/check-in for active workspace, no workspace, onboarding incomplete, due/overdue/submitted/reviewed check-ins.
  - Lead list/detail pipeline statuses.

