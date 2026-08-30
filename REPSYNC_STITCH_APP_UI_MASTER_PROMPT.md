# Google Stitch Master Prompt: RepSync Authenticated App UI Redesign

Design a complete, connected, premium authenticated application UI for **RepSync**, a web-first SaaS operating system for personal trainers, online coaches, coaching teams, and their clients.

This brief is for the **RepSync product itself**, not the public marketing website. Do not create a landing page, pricing page, promotional hero, public coach profile, or marketing content. Start inside the signed-in application and design the real working product.

The result must feel like one coherent operating system across three connected contexts:

1. **RepSync PT Hub** for the trainer's business, public profile, leads, packages, revenue, analytics, and coaching spaces.
2. **Coaching Workspace** for daily client delivery, programming, check-ins, messages, calendar, team operations, and client detail.
3. **RepsyncME Client App** for a client's workouts, nutrition, habits, check-ins, messages, progress, medical data, wearables, and settings.

Do not simplify RepSync into a generic dashboard. Preserve the role boundaries, operational density, data states, builders, queues, and connected workflows described below.

## 1. Product Purpose

RepSync connects the entire coaching relationship:

- A trainer builds a professional identity and publishes coaching packages.
- Prospective clients find a coach, apply, and enter a lead conversation.
- The trainer reviews, contacts, approves, declines, or converts the lead.
- A converted client enters a specific coaching workspace.
- The client completes onboarding, baseline measurements, health context, and goals.
- The coach assigns programs, workouts, nutrition, habits, and recurring check-ins.
- The client completes work, logs actual results, sends messages, uploads photos, and shares progress.
- The coach sees attention signals, reviews check-ins, adjusts delivery, and follows up.
- Owners can invite team members, scope client access, manage defaults, and monitor business health.

The core product promise is: **show what needs attention, what is moving, and the next useful action.**

## 2. User Types and Permissions

Design all screens with permissions and scope in mind.

### Trainer account

An independent trainer may own multiple coaching workspaces. Their global PT Hub is separate from any individual workspace.

### Workspace roles

- **Owner:** full workspace, team, client, delivery, billing, and destructive-action access.
- **Admin:** team, client, lifecycle, messaging, and delivery management, but no owner-only billing or destructive actions.
- **Coach:** client creation, editing, lifecycle, messaging, and delivery management.
- **Assistant Coach:** can view and edit assigned clients and send messages, but cannot manage delivery libraries or the team.
- **Viewer:** read-only workspace and client visibility.

### Client access modes

- **All clients:** member can see the full workspace roster.
- **Assigned clients only:** member sees only explicitly assigned clients.

### Client user

A client may use RepSync independently or inside an active coaching relationship. Their personal activity, coach-assigned activity, lead conversations, and workspace relationship must remain clearly distinguished.

Permission-denied states must explain the boundary without exposing inaccessible data. Read-only states must remain useful and visually distinct from disabled or broken states.

## 3. Visual Direction: Human Precision OS

Translate the approved RepSync **Human Precision** brand into operational software.

The app should feel like a calm, exact coaching studio: disciplined enough for serious operations, warm enough for a human coaching relationship, and distinctive enough to be unmistakably RepSync.

### Atmosphere

- Density: 7/10, data-rich and efficient without becoming cramped.
- Visual variance: 5/10, structured grids with occasional asymmetric emphasis for the main action area.
- Motion: 4/10, restrained and functional.
- Tone: premium, athletic, calm, precise, human, trustworthy.
- Avoid decorative spectacle. The user's work is the visual focus.

### Color system

- **Warm Paper Canvas:** `#F3F1E9` for the main light canvas.
- **Clear Paper Surface:** `#FBF9F1` for primary working surfaces.
- **Deep Forest Ink:** `#12231D` for primary text and dark-theme structure.
- **RepSync Forest:** `#285D49` for primary actions, selected navigation, focus, and brand identity.
- **Forest Deep:** `#0B4533` for high-contrast active states and dark surfaces.
- **Clay Signal:** `#B66A47` as the single expressive accent for human attention, priority, and editorial emphasis. Do not use clay as the main CTA color.
- **Sage Wash:** `#D3E7DD` for quiet selected surfaces and positive context.
- **Structural Border:** `#C0C9C2` for light-mode rules and dividers.
- **Muted Text:** `#68716C` for secondary information while maintaining WCAG AA contrast.
- **Danger:** use a restrained accessible red only for destructive actions and critical risk.
- **Warning:** use muted amber only for overdue or pending operational states.
- **Info:** use a restrained teal-blue only when information cannot be represented by forest.

Dark mode must use Deep Forest Ink and near-black green-charcoal surfaces, not blue-black or purple slate. Light mode must remain warm and precise, not beige lifestyle branding.

### Typography

- Use **Instrument Sans** for headings, body, labels, controls, and navigation.
- Use **Geist Mono** for timestamps, IDs, compact metrics, durations, weights, repetitions, and tabular numbers.
- Do not use serif typography inside the authenticated app.
- Page title: 28-34px desktop, 24-28px tablet, 22-26px mobile.
- Section title: 18-22px.
- Body and table text: 14-16px.
- Utility labels: 11-13px, sentence case or short uppercase metadata.
- Letter spacing must be zero except restrained uppercase metadata, which may use `0.06em`.
- Do not scale fonts with viewport width.

### Shape and surface rules

- Cards and panels use a maximum 8px corner radius.
- Use cards only for genuinely bounded modules, repeated entities, dialogs, builders, and focused tools.
- Do not put cards inside cards. Use dividers, rows, bands, tabs, or whitespace inside a main panel.
- Prefer 1px structural rules and tonal surfaces over heavy shadows.
- Shadows must be subtle and functional, never glowing.
- Do not use gradient backgrounds, gradient text, floating orbs, bokeh, glassmorphism, neon, or decorative blur.
- Keep forms flat, labeled, and predictable.

### Iconography

- Use one consistent Lucide-style outline icon set.
- Use familiar icons for search, filter, add, edit, save, delete, calendar, message, notification, upload, download, visibility, and navigation.
- Every icon-only control needs a tooltip and accessible label.
- Do not use emojis or custom illustrated icons in operational controls.

## 4. Global Application Architecture

### Desktop shell

- Persistent left navigation rail, 248-272px expanded and 72-80px collapsed.
- The rail contains RepSync identity, context label, grouped navigation, collapse control, and account access.
- Sticky top utility bar inside the content area with page title, optional concise context, search, notifications, primary contextual action, workspace switcher, and profile menu.
- Main content is a dense scrollable canvas with a maximum width around 1440px, aligned left rather than centered like a marketing page.
- Use a 12-column content grid and 24px desktop gutters.
- Keep the active workspace or PT Hub context visible at all times.

### Tablet shell

- Collapsed icon rail or temporary navigation drawer.
- Preserve the page title and one primary action in the sticky header.
- Move secondary utilities into an overflow menu.

### Mobile shell

- Client app uses a bottom navigation bar for Home, Workouts, Check-ins, Messages, and More.
- Coach and PT Hub contexts use a top bar plus slide-out navigation because their information architecture is deeper.
- Every tap target is at least 44px.
- No horizontal page scrolling.
- Dense tables become stacked labeled rows or purpose-built mobile lists, not squeezed desktop tables.
- Sticky actions must respect safe areas and never cover content.

### Shared global utilities

- Workspace and context switcher between PT Hub and available coaching spaces.
- Global search across routes, clients, programs, workouts, and check-ins.
- Notification bell with unread count, preview panel, mark-as-read controls, and View all.
- Invite client action in coaching contexts.
- Profile menu with settings, theme, and sign out.
- Theme support: light, dark, and system preference.
- Localization-ready layout for language, region, date format, units, week start, and timezone.

## 5. Navigation Information Architecture

### RepSync PT Hub navigation

**Home**

- Overview
- Coach Profile
- Packages
- Profile Preview

**Clients**

- Leads
- Clients
- Coaching Spaces
- Payments
- Analytics

**Account**

- Settings

### Coaching Workspace navigation

**Operate**

- Dashboard
- Clients
- Messages
- Calendar
- Check-ins

**Build**

- Programs
- Workout Templates
- Nutrition Programs
- Check-in Templates
- Exercise Library

**Control**

- Workspace Settings

### RepsyncME client navigation

- Home
- Workouts
- Nutrition
- Habits
- Wearables
- Check-ins
- Messages
- Coach Marketplace
- Progress
- Medical
- Baseline
- Settings

On mobile, place lower-frequency client destinations under More while preserving direct access to Home, Workouts, Check-ins, and Messages.

## 6. Shared Component System

Create a coherent component library before composing screens.

### Required components

- App shell, left rail, mobile drawer, client bottom navigation.
- Page header with title, context, breadcrumbs when useful, and contextual actions.
- Workspace switcher and role indicator.
- Command search overlay with grouped result types.
- Notification panel and notification list item.
- Compact KPI tile with label, value, trend, and optional helper.
- Section panel with header, actions, body, loading, empty, and error variants.
- Data table with sortable headers, filters, pagination, bulk selection, row action menu, and responsive list fallback.
- Filter bar with search, segmented views, select menus, chips only for active filters, and Reset filters.
- Status badge and status explanation tooltip.
- Timeline, activity feed, metric sparkline, line chart, bar chart, funnel, calendar, and progress ring.
- Tabs for entity detail pages; horizontal scrolling tabs on mobile only when necessary.
- Form field, textarea, select, combobox, checkbox, radio, switch, date picker, time picker, number input, unit input, file upload, image upload, and tag input.
- Save bar with dirty state, Saving, Saved, failure, Cancel, and retry states.
- Modal, confirmation dialog, destructive confirmation, side sheet, tooltip, toast, and inline alert.
- Empty state with a specific explanation and one relevant action.
- Skeleton matching the actual final layout. Do not use generic centered spinners.
- Read-only field state, permission-limited state, archived state, and unavailable integration state.

### Status system

Never communicate state through color alone. Use label, icon, and tooltip or supporting text.

Client relationship states:

- Active relationship
- Removed
- Transferred out

Client lifecycle states:

- Invited
- Onboarding
- Active
- Paused
- Completed
- Churned

Attention states and reasons:

- Healthy
- Needs attention
- At risk
- Manually flagged by coach
- Overdue check-in
- Missed latest check-in
- No recent client reply
- Adherence trending down
- No active delivery
- No recent client activity

Lead states:

- New
- Contacted
- Approved, pending workspace
- Converted
- Declined

Package states:

- Draft
- Active
- Archived
- Public or private visibility

Notification, invoice, connection, onboarding, check-in, workout, and assignment states must use the same semantic success, info, warning, danger, and neutral system.

## 7. Access, Authentication, and Bootstrap Screens

These are product entry screens, not marketing screens.

### Sign in

- RepSync mark, email, password, show password, Remember me, Sign in, Forgot password, and account creation link.
- Calm authentication error states and rate-limit feedback.
- No promotional split-screen illustration.

### Forgot and reset password

- Email request state, sent confirmation, token validation, new password, confirm password, password rules, expired link, and success redirect.

### No workspace

- Explain that the trainer needs a coaching workspace.
- Primary action: Create workspace.
- Secondary access to existing shared invites or PT Hub.

### Create coaching workspace

- Workspace name, identity preview, validation, create state, failure state, and success transition.

### Finish trainer profile

- Account identity, display name, contact details, timezone, city/region, profile photo, and completion status.

### Finish client account

- Identity, contact, required profile details, coach invitation context, and success transition into onboarding.

### Team invite acceptance

- Workspace name, invited email, proposed role, client access mode, expiry, authentication requirement, accept, decline, invalid, expired, revoked, and already accepted states.

## 8. RepSync PT Hub Screens

### 8.1 Overview: Business Command Center

Purpose: show business readiness and the most important next business actions.

Include:

- Compact metrics for active coaching spaces, active clients, applications this week, profile completion, and subscription status.
- A dominant command center with prioritized setup or business tasks.
- Full activation checklist: workspace exists, profile complete, profile published, first client, workout assigned, nutrition assigned, check-in assigned, and co-coach invited or active.
- Setup status modules for Leads, Clients, and Revenue and billing.
- Recent activity feed with timestamps and destinations.
- Clear fallback when a metric source is not connected.

### 8.2 Coach Profile Editor

Purpose: build the trainer's public identity without leaving the app.

Include:

- Persistent profile readiness and publication status.
- Profile media: profile photo and banner upload, preview, replace, remove, crop state, progress, validation, and failure.
- Brand identity: full name, display name, headline, searchable headline, short bio with character count.
- Positioning and proof: specialties, certifications, coaching style, testimonials, and transformations with before/after images.
- Coaching modes: one-to-one, programming, nutrition, accountability.
- Availability modes: online and in person.
- Package management entry point.
- Public route: editable slug, URL preview, availability, and copy link.
- Discoverability: marketplace visibility and location.
- Social links with platform, label, and URL.
- Launch panel with blockers, completion percentage, Save draft, Publish, Unpublish, and View profile.

### 8.3 Profile Preview

- Render the final profile inside a clean preview frame.
- Desktop and mobile preview toggles.
- Published, draft, and incomplete banners.
- Edit profile and copy public URL actions.

### 8.4 Packages

- Reorderable package list with draft, active, archived, public, and private states.
- Create and edit package form with title, subtitle, price, currency, billing frequency, status, display order, description, features, CTA label, and public visibility.
- Duplicate, archive, restore, move up, move down, and delete controls.
- Show how package cards appear on the public profile without turning this screen into a marketing page.

### 8.5 Leads Pipeline

- Summary metrics for new, waiting, approved, converted, and declined demand.
- Search, status filter, source filter, package-interest filter, sort, and reset.
- Lead table/list with name, goal, package interest, source, status, submitted time, last message, unread count, and next action.
- Pipeline can switch between dense table and status-board view.
- Empty states for no demand and no filter matches.

### 8.6 Lead Detail

- Header with lead name, status, submitted time, source, and primary next action.
- Application snapshot: source, email, phone, goal, experience, and legacy budget when present.
- Package interest: selected at application, current package, and package state.
- Lead chat with message history, unread marker, compose field, send state, and archive state.
- Internal notes with author and timestamp.
- Status management with guarded transitions between New, Contacted, Approved pending workspace, Converted, and Declined.
- Conversion workflow: choose target coaching workspace, confirm client creation, show converted timestamp and destination client.
- Decline workflow with reason and conversation archive behavior.

### 8.7 Cross-Workspace Client Directory

- KPIs: Total Clients, Active, At Risk, Paused.
- Search, lifecycle filter, attention segment filter, relationship view, workspace filter, sort, and pagination.
- Rows show client, workspace, lifecycle, attention reason, onboarding, last activity, overdue check-ins, and relationship status.
- Open client in the correct workspace.

### 8.8 Coaching Spaces

- Workspace list with name, relation, role, owner, active client count, assigned-client count where scoped, last updated, and status.
- Current, active, shared, and new workspace treatment.
- Create workspace, open workspace, and workspace settings actions.

### 8.9 Payments and Revenue

- Revenue snapshot, active paying clients, package pricing, billing connection, and subscription status.
- Billing Command Center with payment method, renewal date, trailing revenue, and package pricing.
- Setup rail showing billing readiness and missing integrations.
- Invoice ledger with invoice, client, amount, status, issue date, download, empty state, and unavailable-source state.
- Clearly mark manual or placeholder billing data. Never imply live payment processing when it is not connected.

### 8.10 Analytics: Business Health

- Global date range applied to all modules.
- Business Command Center metrics: submitted demand, conversion, median response, and active clients.
- Lead funnel from submitted to approved to converted.
- Lead trend with Leads, Approved, and Converted series.
- Lead quality breakdown.
- Speed to action: median first response, leads waiting more than 24 hours, average days from new to approved, and approved to converted.
- Client risk and delivery health: active at risk, overdue check-ins, paused, and churned.
- Workspace performance comparison with attributed leads, conversions, and at-risk rate.
- Tracking coverage that honestly explains connected and missing sources.
- Every chart needs accessible labels, legends, empty states, and tabular fallback.

### 8.11 PT Hub Notifications

- Filter All, Unread, Leads, Clients, Billing, and System.
- Mark one or all as read.
- Each notification includes source, concise event, timestamp, unread state, and destination.

### 8.12 PT Hub Settings

Use a stable settings side navigation with these tabs:

- **Account:** account email, trainer ID, full name, contact email, country, phone, timezone, and city.
- **Preferences:** theme, language, region, date format, week start day, units, and density.
- **Notifications:** lead alerts, weekly digest, product updates, in-app channel, email placeholder, and push placeholder.
- **Security:** current password, new password, confirmation, MFA status, active sessions, and recovery-method availability.
- **Billing:** current plan, billing portal, payment methods, and invoice history.
- **Integrations:** calendar, email/domain, CRM placeholder, and marketing automation placeholder.

## 9. Coaching Workspace Screens

### 9.1 Coach Dashboard

Purpose: provide the coach's daily action queue.

Include:

- KPIs: Clients, Average adherence, Unread messages, Check-ins today.
- Dominant client attention queue with client, lifecycle, attention label, reason, last activity, and quick action.
- Recent check-ins with submitted, overdue, due now, and review state.
- General queue for delivery or follow-up work.
- Editable to-do list with add, complete, reopen, and delete.
- Invite client action.
- Zero state for first client and partial-error states for individual modules.

### 9.2 Clients Roster

- KPIs: Total Clients, Active, At Risk, Paused.
- Search by client.
- Lifecycle filter.
- Segment filter: All, Onboarding incomplete, Check-in overdue, At risk, Paused.
- Relationship view and pagination.
- Dense client rows with avatar, name, lifecycle, attention, goal, adherence, last activity, onboarding status, overdue count, and quick message.
- Invite client and open client actions.

### 9.3 Client Detail: Persistent Entity Workspace

The client detail is one of RepSync's most important screens. It must feel like a professional operating console, not a stack of unrelated cards.

Persistent header:

- Client name, avatar, goal, workspace, lifecycle badge, attention badge, relationship state, and last activity.
- Primary actions: Message, Edit lifecycle, Flag or clear risk, More actions.
- More actions: pause, resume, complete, churn, remove, transfer, and archive-safe operations with confirmations.

Overview area:

- Coach Queue with client-specific follow-ups.
- Compact metrics: adherence, consistency streak, check-in status, and last workout.
- Plan and Calendar preview.
- Clear empty state when no plan exists.

The Coaching Workspace tab rail contains every tab below.

#### Onboarding tab

- Progress, status, required-step completion, submitted answers, missing information, baseline link, coach review notes, Approve, Request changes, and Complete onboarding.
- Keep client answers, coach review, and completion actions visually separate.

#### Baseline tab

- Body metrics, performance markers, before photos, notes, submitted time, and coach notes.
- Historical baseline entries must be read-only and clearly dated.

#### Workout tab

- Active program with start date, week count, status, pause, resume, switch, and unassign.
- Assign program from template library.
- Client calendar with workout, nutrition, rest, and check-in markers.
- Schedule workout for a date, rest-day override, template selection, and notes.
- Next 14 days schedule with planned sessions, recovery, and overrides.
- Workout session logs with exercise sets, repetitions, load, RPE, completion, and notes.

#### Nutrition tab

- Current nutrition assignment, active dates, plan status, and assignment source.
- Assign, switch, pause, or remove nutrition program.
- Day and meal structure with planned targets and client completion.
- Empty state when no program is assigned.

#### Medical tab

- Medical history entries.
- Lab result entries with metric, value, unit, reference range, and date.
- Uploaded reports with file metadata, date, view, download, and remove permissions.
- Strong privacy language and a clear record of what the client shared.

#### Check-ins tab

- Current assignment: template, frequency, start, due logic, and active status.
- Assign or replace template.
- Check-in history with Submitted, Waiting review, Reviewed, Overdue, and incomplete-required-item states.
- Review workspace with Answers, Photos, and Notes tabs.
- Coach feedback, internal notes, save state, and review completion.

#### Progress tab

- Trend snapshot across habits, training, and check-ins.
- Habit shifts comparing previous and current periods.
- Training progression and recent lift changes.
- Check-in themes with numeric and narrative changes.
- Empty states that explain which data needs to accumulate.

#### Habits tab

- Day-by-day log for the last seven days.
- Calories, protein, carbohydrates, fats, weight, sleep, steps, energy, hunger, stress, and notes.
- Current streak, previous streak, adherence summary, and trend comparison.

#### Logs tab

- Chronological client activity: workout completion, nutrition updates, habit logs, check-ins, messages, lifecycle changes, and assignments.
- Filter by activity type and date.

#### Notes tab

- Add private coach note.
- Recent notes with author, timestamp, edit, delete, and empty state.
- Clearly label notes as internal and not visible to the client.

#### Wearables panel

- Connection status, provider, last sync, consent, visibility mode, and data freshness.
- Steps, sleep, active minutes, resting heart rate, recovery/load, sleep score, deep sleep, and REM summaries.
- Connected with no data, disconnected, disabled, hidden from PT, stale, and summary-only states.

### 9.4 Messages

- Two-pane inbox on desktop and conversation-first navigation on mobile.
- Conversation list with client, lifecycle or lead context, last message, timestamp, unread count, search, and filters.
- Thread header with client context and open-client action.
- Message timeline with sender attribution, dates, unread divider, loading older messages, and failed-message retry.
- Compose field with send state and disabled state when access is removed.
- Floating quick-compose from other coach screens.

### 9.5 Coach Calendar

- Month view with previous, next, today, month label, and create event.
- Events, workout assignments, check-ins, and sessions use icons plus labels, not color alone.
- Day panel showing events and assignments for the selected date.
- Create/edit event with title, client, date, time, type, notes, and recurrence where supported.
- Direct links from calendar items to the relevant client or check-in.

### 9.6 Check-in Queue

- Summary KPIs: Submitted, Overdue, Due now, Soon.
- Grouped sections with client, schedule, submitted/due time, status, and action label.
- Primary actions Review, Remind, Open client, or Configure.
- Empty state per group.

### 9.7 Check-in Template Library and Builder

- Summary of templates, assignments, and historical submission safety.
- Active and archived template list.
- Create, edit, duplicate, archive, restore, and delete where safe.
- Builder fields: template name, description, frequency defaults, active state, and ordered questions.
- Question types: short text, long text, number, scale, single select, multi-select, and photo request.
- Per-question required state, options, helper text, reorder, duplicate, and remove.
- Assignment view for explicit client overrides.
- Historical templates remain available to old submissions even after archive.

### 9.8 Programs Library and Program Builder

- Searchable program library with active and archived states.
- Program card/row: name, description, week count, assignment count, updated time, edit, duplicate, archive, and delete when safe.
- Builder includes program name, description, week count, status, and weekly layout.
- Week tabs and day slots.
- Assign workout template or rest day to each day.
- Reorder and copy days or weeks.
- Save draft, publish/activate, archive, dirty state, and validation.

### 9.9 Workout Template Library, Preview, and Builder

- Library with search, tags, workout type, active/archived state, and create action.
- Preview with description and ordered exercises.
- Builder with template name, description, workout type tag, notes, and ordered exercise rows.
- Exercise row supports sets, repetitions, load guidance, rest seconds, tempo, RPE, notes, superset grouping, drag reorder, duplicate, and remove.
- Exercise library side sheet with search, filters, recent items, and select action.
- Clear unsaved changes and validation states.

### 9.10 Nutrition Program Library and Builder

- Searchable library with tag, duration, status, updated time, and assignment count.
- Builder includes Program Meta, Program Scope, week/day selector, Meal Slots, and Components.
- Meal slots include breakfast, lunch, dinner, snacks, and configurable labels.
- Components include food or instruction label, quantity, unit, calories, protein, fats, carbohydrates, notes, order, duplicate, and remove.
- Copy a meal or day across days where supported.
- Save, archive, validation, and empty states.

### 9.11 Exercise Library

- Search, muscle group, equipment, movement pattern, tags, active/archived filter, and sort.
- Exercise rows/cards include name, tags, instructions, video/media status, usage, edit, archive, and restore.
- Create/edit exercise with validation and media handling.

### 9.12 Performance Marker Library

- Marker name, category, unit, direction of improvement, active state, display order, and usage.
- Create, edit, activate/deactivate, reorder, and safe-delete behavior.

### 9.13 Workspace Settings

Use a settings side navigation and quiet grouped sections.

- **General:** workspace display name, logo, internal code, timezone, units, and week start day.
- **Client Experience:** welcome message and new-client instructions with character count and preview.
- **Team and Permissions:** active members, pending invites, invite member, role, all-client or assigned-client access, assigned clients, resend, revoke, suspend, remove, and transfer ownership boundaries.
- **Defaults:** default check-in template, default program template, workout/nutrition/habit defaults, and template-library behavior.
- **Automations:** missed check-in reminders, inactivity nudges, onboarding reminders, risk flag rules, and overdue logic. Clearly mark unsupported automation as unavailable rather than pretending it works.
- **Integrations:** wearables enablement, provider allowlist, metric groups, PT visibility, freshness threshold, disconnect behavior, client consent copy, calendar, messaging, and CRM placeholders.
- **Danger Zone:** archive workspace, transfer ownership, leave workspace, and delete workspace with role-aware confirmation.

### 9.14 Internal Ops Status

- Restricted operational screen for runtime health, service status, environment information, and guidance.
- Never expose secrets.
- Keep it visually separate from ordinary trainer workflows.

## 10. RepsyncME Client App Screens

The client app should feel simpler and more encouraging than the coach workspace while using the same tokens and component family. Prioritize today's action, progress, and communication. Avoid gamified confetti, childish streak celebrations, or fitness-influencer visuals.

### 10.1 Client Onboarding

Use a multi-step shell with visible progress, Save and continue, Back, validation, draft recovery, and an action-needed state.

Steps and fields:

1. **Identity:** full name, phone, email, date of birth, sex/gender, location, timezone, height, current weight, optional avatar, and unit preference.
2. **Goals:** primary goal, secondary goals, motivation, and what success looks like.
3. **Training:** training experience, current frequency, equipment access, gym name, confidence, available days, current routine, injuries, movement limitations, exercises to avoid, and surgery/injury history.
4. **Nutrition:** dietary preferences, allergies/intolerances, foods avoided, cooking confidence, and eating-out frequency.
5. **Lifestyle:** sleep quality, stress level, work schedule or routine constraints, and preferred training time.

Show completion status, missing required information, submitted state, coach review state, and requested-change state.

### 10.2 Client Home

- Personalized but compact greeting and current coaching context.
- One dominant Today panel showing the next workout, nutrition task, check-in, or onboarding action.
- Week calendar with previous and next week.
- Habits summary and quick log.
- Workouts and nutrition summary.
- Profile-completion prompt when required.
- Lead conversations for clients not yet converted.
- No-active-workspace state with Coach Marketplace action.
- Partial-loading and unavailable-module states.

### 10.3 Workouts Hub

- Unified personal and coach-assigned workouts.
- Sections: In Progress, Today, Upcoming, Recently Completed.
- Create personal workout when allowed.
- Clear source label: Personal or Coach assigned.
- Search/filter as the library grows.
- Edit and delete only personal workouts.
- Drag exercises into supersets when editing personal workouts.

### 10.4 Workout Detail

- Workout title, source, date, status, coach note, description, duration estimate, and exercise count.
- Ordered exercise list with sets, repetitions, load, rest, tempo, RPE, and notes.
- Start workout, resume, and view summary actions.

### 10.5 Active Workout Session

- Distraction-reduced session shell.
- Exercise navigation rail or drawer.
- Active exercise panel with media, instructions, target sets, reps, load, rest, tempo, and coach note.
- Per-set logging for repetitions, load, RPE, completion, and notes.
- Rest timer with start, pause, skip, and completion state.
- Session progress, elapsed time, previous/next exercise, finish confirmation, and exit-without-losing-progress behavior.
- Mobile-first design for use in a gym.

### 10.6 Workout Summary

- Session recap, duration, completed exercises, completed sets, training volume, RPE, personal bests where valid, notes, and coach-visible submission state.
- Return Home, View workout, and Message coach actions.

### 10.7 Nutrition Hub

- Unified coach-assigned and personal nutrition.
- Today panel with meals/tasks and completion.
- Personal templates list.
- Assigned plan summary with source, dates, and status.
- Clear empty states for no nutrition today, no assigned plan, and no personal templates.

### 10.8 Create Personal Nutrition Plan

- One-week builder using day tabs.
- Meal slots and meal components.
- Component label, quantity, unit, calories, protein, fats, and carbohydrates.
- Duplicate meal across all days.
- Reorder, remove, save draft, validation, and complete creation.

### 10.9 Nutrition Day

- Date and daily target summary.
- Meal list with planned and actual state.
- Meal detail to update actual intake.
- Planned versus actual summary for calories and macros.

### 10.10 Habits

- Daily log for nutrition, recovery, and activity.
- Calories, protein, carbohydrates, fats, weight, sleep hours, steps, energy, hunger, stress, and notes.
- Locked historical state where edits are not permitted.
- Seven-day trends and no-data guidance.

### 10.11 Check-ins

- Schedule summary, next due date, frequency, and current state.
- Check-in form with configured question types, required indicators, inline validation, autosave/draft state, and submit confirmation.
- Progress-photo uploads with preview, replace, remove, progress, and validation.
- Previous check-ins with Submitted, Reviewed, Waiting review, Overdue, and missing-required-item states.
- Coach feedback after review.
- No-schedule, not-open-yet, and no-questions states.

### 10.12 Messages

- One inbox for lead and active coaching conversations.
- Conversation list, unread counts, hidden/archived toggle, search, and context label.
- Thread with sender attribution, coach identity, dates, unread divider, and compose.
- Suggested conversation starters only when no messages exist.
- Find a Coach and Open Home actions in the appropriate empty state.

### 10.13 Progress

- Body-weight trend with date range.
- Training-volume trend.
- Recovery and activity section for sleep and steps.
- Exercise changes showing load or repetition progression.
- Progress summary with latest measurements and meaningful deltas.
- Accessible chart summaries and no-data states.

### 10.14 Wearables

- Workspace-disabled state.
- No wearable connected state with provider selection.
- Consent explanation before connection.
- Connected provider, last sync, disconnect, reconnect, stale, and error states.
- KPIs: steps, sleep, active minutes, resting heart rate, recovery/load, sleep score, efficiency, deep sleep, and REM.
- Trends and connected-with-no-data state.

### 10.15 Coach Marketplace

This is an authenticated product discovery surface, not the public marketing site.

- Search by name, specialty, coaching mode, availability, and location.
- Published coach result cards with real photography, display name, headline, specialties, online/in-person availability, location, and View profile.
- No coaches, no matches, and unavailable states.
- Preserve the client app shell.

### 10.16 Medical

- Privacy notice explaining coach visibility.
- Add medical history item.
- Add lab result with metric, value, unit, reference range, and date.
- Upload report with type, date, file, and notes.
- Lists for history on file, lab results, and uploaded reports.
- Edit, remove, view, download, loading, error, and empty states.

### 10.17 Baseline

- Body metrics with units and measurement date.
- Workspace-configured performance markers.
- Front, side, and back progress photos with upload states.
- Notes, review, confirmation, submitted, and already-submitted states.
- Make clear that submission counts toward onboarding.

### 10.18 Client Profile and Settings

Use settings tabs or side navigation depending on viewport.

- **Profile:** avatar, full name, email, phone, date of birth, gender, height, weight, timezone.
- **Training:** experience, equipment access, availability, current routine, and confidence.
- **Health and Goals:** primary goal, secondary goals, motivation, injuries, limitations, and exercises to avoid.
- **Recovery and Lifestyle:** sleep, stress, work constraints, and preferred training time.
- **App Preferences:** units, date format, language, and theme.
- **Notifications:** in-app, email, push, and grouped event preferences.
- **Security:** authentication identity, password change, and active sessions.
- **Billing:** current coaching service, billing status, invoice history, and saved payment method where available.
- **Account deletion:** isolated destructive request flow.

### 10.19 Client Notifications

- Filter All, Unread, Workouts, Check-ins, Messages, Billing, and System.
- Mark read, mark all read, and navigate to the referenced item.

## 11. Realistic Seeded Content for All Concepts

Do not use generic placeholder names, lorem ipsum, fake perfect percentages, or meaningless charts.

Use this coherent demo world:

- Trainer: **Alex Mercer**, strength and sustainable performance coach.
- PT business: **Mercer Performance Lab**.
- Workspaces: **Online Coaching**, **Doha Studio**, and shared workspace **Northline Strength Team**.
- Team: **Alex Mercer** Owner, **Leila Haddad** Coach, **Marcus Bell** Assistant Coach, **Rina Cho** Viewer.
- Clients: **Maya Chen**, **Omar Patel**, **Nina Brooks**, **Jordan Reed**, **Amira Saleh**, **Elias Grant**, **Sofia Karim**, and **Daniel Park**.
- Leads: **Eliana Torres**, **Samir Khan**, **Grace Okafor**, and **Theo Martin**.
- Packages: **Foundation Coaching**, **Performance Build**, and **Nutrition Accountability**.
- Programs: **Strength Base 12**, **Return to Running**, and **Lean Performance Block**.
- Workout templates: **Lower Strength A**, **Upper Volume B**, **Conditioning Reset**, and **Mobility Recovery**.
- Check-in templates: **Weekly Coaching Review**, **Nutrition Adherence**, and **Return-to-Training Readiness**.

Use realistic imperfect values:

- 18 active clients.
- 4 clients need attention.
- 6 check-ins due.
- 3 unread replies.
- 73% average adherence.
- 3 leads ready for follow-up.
- One overdue check-in, one low-adherence trend, one onboarding client, and one paused client.
- Use believable dates, timestamps, weights, repetitions, durations, response times, invoice amounts, and conversion counts.

Keep data consistent between screens. A client flagged on the dashboard must carry the same reason into the roster and client detail. A converted lead must appear in the destination workspace. A completed workout must update Home, Progress, and the coach's activity log.

## 12. Interaction and State Requirements

Every major screen must include designed states, not only the ideal populated state.

Required state coverage:

- Loading skeleton.
- First-use empty state.
- Filtered empty state.
- Partial data failure.
- Full error with retry.
- Offline or reconnecting state where relevant.
- Read-only permission state.
- No-access state.
- Dirty form and unsaved changes.
- Saving, saved, and save failed.
- Destructive confirmation.
- Archived or historical record.
- Integration unavailable or not connected.
- Mobile navigation and mobile action placement.

Do not hide unavailable functionality behind fake active controls. Use honest labels such as Not connected, Not enabled, Coming later, or Read-only fallback.

### Motion

- Use 150-220ms color, border, and opacity transitions.
- Use a small 1px tactile press on buttons.
- Use restrained list reveal only on initial load.
- Animate only opacity and transform.
- No constant pulsing, floating cards, parallax, scroll-jacking, or decorative background movement.
- Respect reduced-motion preferences.

### Accessibility

- Target WCAG AA in light and dark themes.
- Maintain visible keyboard focus.
- All form fields have persistent labels.
- Mark required fields explicitly and identify optional fields without making the user guess.
- Use the correct mobile keyboard and input type for email, phone, numbers, dates, URLs, weights, and repetitions.
- Support browser autofill for identity, contact, and authentication fields.
- Place validation beside the relevant field.
- Provide chart summaries and table alternatives.
- Do not rely on color alone for status.
- Support keyboard navigation in menus, dialogs, tabs, builders, tables, and drag-reorder alternatives.

## 13. Responsive Behavior

Verify the system at 375px, 768px, 1024px, 1440px, and wide desktop.

- Desktop optimizes scanning and repeated action.
- Tablet preserves two-column layouts only when content remains readable.
- Mobile collapses all major multi-column content to one column.
- Client detail tabs become a compact scrollable tab rail or More menu.
- Builders use a stepper or drawer-based library selection on mobile.
- Tables become labeled list rows.
- Charts simplify labels but retain accessible summaries.
- Dialogs become full-height sheets on small screens.
- Primary save or submit actions may become a sticky bottom bar, with safe-area spacing.
- Text must never overlap, clip, or escape its container.

## 14. Explicit Anti-Patterns

Never create any of the following:

- A marketing hero inside an authenticated screen.
- Generic SaaS shortcut-card grids that duplicate the sidebar.
- Oversized greeting copy that pushes work below the fold.
- Three equal decorative cards used as the default composition.
- Nested card stacks.
- Purple, neon blue, crypto, or gaming aesthetics.
- Gradients, glass blur, glowing borders, or floating decorative shapes.
- Cartoon fitness illustrations, gamified confetti, emoji icons, or childish achievement badges.
- Stock bodybuilder imagery as dashboard decoration.
- Pure black or pure white as dominant canvases.
- Excessively rounded pills and containers.
- A status represented only by color.
- Tiny low-contrast text.
- Giant numbers without decision context.
- Fake live payment, automation, wearable, or integration states.
- Generic names such as John Doe or Acme Fitness.
- Copy such as Elevate, Seamless, Unleash, Next-gen, Transform your journey, or All-in-one solution.
- Placeholder charts with impossible or perfectly round values.
- Horizontal overflow on mobile.
- Hover effects that move layout.

## 15. Stitch Deliverable Instructions

Create a connected multi-screen design project, not isolated mood-board fragments.

1. Establish the global token sheet and component library first.
2. Create the three shells: PT Hub, Coaching Workspace, and RepsyncME.
3. Produce high-fidelity desktop screens for every screen family in this brief.
4. Produce mobile variants for the Client Home, Workouts Hub, Active Workout Session, Check-ins, Messages, Client Progress, Coach Dashboard, Clients Roster, Client Detail, and Lead Detail.
5. Include populated, empty, loading, error, read-only, and unavailable states where specified.
6. Connect navigation and core prototype actions so the experience can be clicked through.
7. Preserve the same names, metrics, statuses, and records across related screens.
8. Keep the public marketing website outside this project.

The final result should make a trainer understand within three seconds:

- where they are,
- which business or workspace they are operating in,
- what needs attention,
- what changed,
- and what action to take next.

The client experience should make the client understand within three seconds:

- what they need to do today,
- what their coach assigned,
- what progress they are making,
- and how to contact their coach.

Design RepSync as a real, coherent coaching operating system with premium restraint, human warmth, and operational precision.
