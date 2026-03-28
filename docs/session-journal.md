# CoachOS Session Journal

This file is the canonical cross-session handoff for this repo. It is intended to be read at the start of work and updated at the end of any meaningful work session.

## Required Update Protocol

When working in this repository, every agent or human contributor should treat this document as required workflow state, not optional notes.

1. Before starting work, read the latest session entry and the open follow-ups.
2. After any meaningful work session, append a new dated entry.
3. Every new entry must include:
   - timestamp in local time if known
   - branch name
   - goal of the session
   - what changed
   - files changed
   - commands/tests run
   - blockers, mistakes, or struggles
   - current repo state
   - next recommended step
4. If exact times were not captured during the session, record the date and clearly say the timing is approximate.
5. Do not delete old entries. Add corrective notes instead.

## Entry Template

```md
## YYYY-MM-DD HH:MM +/-TZ - Short Title

- Branch:
- Goal:
- Changes made:
- Files changed:
- Commands/tests run:
- Struggles / mistakes / blockers:
- Repo state at end:
- Next step:
```

## 2026-03-26 (approximate, multi-step session) - Environment setup, workflow alignment, onboarding review, and onboarding MVP backend

- Branches involved:
  - `main`
  - `fix/onboarding-no-workspace-routing`
  - `On-Boarding-baseline-MVP-bootstrap` (temporary branch created during branch hygiene cleanup)
  - `On-Boarding-baseline-MVP`
- Goal:
  - get this machine into a usable CoachOS development state
  - align the local workflow with the user's other PC
  - review onboarding/baseline behavior
  - implement the backend/schema MVP for onboarding without rebuilding baseline

### Environment and workflow work completed

- Reset the repository to match `origin/main` exactly and removed local tracked/untracked repo changes where requested.
- Confirmed Docker Desktop must run in Linux container mode, not Windows container mode.
- Verified Docker Desktop and local Supabase startup on this PC.
- Clarified the working model:
  - local frontend can point at hosted Supabase for real data
  - local Supabase is primarily for safe migration testing
- Updated local `.env.local` during setup/testing at different points to switch between local and hosted Supabase.
- Verified that local migration testing works on this machine.

### Issues and struggles during environment setup

- Docker Desktop initially reported `Docker Desktop is unable to start`; this turned out to be a startup race while Docker was still bringing up its WSL backend.
- Command output from `docker info`, `supabase`, and `vite` was pasted back into PowerShell and then executed line by line. This produced many `CommandNotFoundException` errors because output lines such as `Path:`, `Version:`, `Server:`, box-drawing characters, and `>` prefixes are not commands.
- The repo workflow was clarified after a few iterations:
  - use hosted Supabase for real data during normal local UI work
  - use local Supabase to validate migrations before pushing

### Review findings recorded during the session

- Onboarding review found two live issues:
  - the client onboarding guard failed open when the `clients` lookup errored
  - PT users with missing local signup intent could be stranded on the no-workspace page with no route into PT onboarding
- Baseline review found two reliability issues that would block a durable onboarding implementation:
  - reminder logic treated any baseline row, including drafts, as completion
  - photo rendering relied on stored signed URLs that could expire

### Fix branch created and pushed earlier in the session

- Branch:
  - `fix/onboarding-no-workspace-routing`
- Recorded commit from session:
  - `8b72c3d`
- Purpose:
  - fix onboarding routing issues found in the review
- Changes made:
  - changed the client onboarding gate to fail closed on profile lookup errors
  - updated the no-workspace screen to provide a PT path instead of only invite-based actions
- Status:
  - pushed to remote during the session

### Baseline / onboarding MVP implementation completed later in the session

- Final working branch:
  - `On-Boarding-baseline-MVP`
- Final commit:
  - `a9a2272` - `Add onboarding MVP backend foundation`
- High-level scope:
  - preserved the existing baseline subsystem
  - added a separate onboarding lifecycle table tied to workspace/client relationship
  - did not overload `clients.status`
  - fixed baseline reminder and photo durability issues

### Files changed for onboarding MVP work

- Added:
  - `supabase/migrations/20260326123000_onboarding_baseline_mvp.sql`
  - `src/lib/baseline-photos.ts`
- Updated:
  - `src/components/common/client-reminders.tsx`
  - `src/pages/client/baseline.tsx`
  - `src/pages/pt/client-detail.tsx`

### What changed in the onboarding MVP work

- Added enum `public.onboarding_source`.
- Added enum `public.onboarding_status`.
- Added table `public.workspace_client_onboardings` with JSONB section storage, linked baseline/program/check-in references, review timestamps, and activation/completion timestamps.
- Added indexes for common workspace/client/status lookups.
- Added RLS policies so:
  - clients can read/update their own onboarding row
  - PT workspace members can read/update rows in their workspace
- Added helper/RPC functions:
  - `ensure_workspace_client_onboarding`
  - `submit_workspace_client_onboarding`
  - `review_workspace_client_onboarding`
  - `complete_workspace_client_onboarding`
- Updated invite acceptance so successful client invite join automatically ensures an onboarding row with source `direct_invite`.
- Fixed reminder logic so only a submitted baseline counts as completed.
- Made baseline photo reads durable by resolving fresh signed URLs from `storage_path`, while keeping legacy `url` fallback for older rows.

### Commands and checks run during the session

- Environment / repo operations included:
  - `docker info`
  - `npm run supabase:start`
  - `npm run supabase:status`
  - `npm run supabase:stop`
  - `npm run dev`
  - `git status`
  - `git pull`
  - `git fetch`
- Validation run for code and schema work:
  - `npm run lint`
  - `npm run build`
  - `npm run supabase:db:lint`
  - disposable local migration test flow was also validated earlier in the session

### Git/branching struggles during onboarding MVP implementation

- Local `main` had been ahead of `origin/main` because of an unrelated earlier local commit. To avoid contaminating the requested feature branch:
  - work was stashed
  - the inherited branch was renamed to `On-Boarding-baseline-MVP-bootstrap`
  - a fresh `On-Boarding-baseline-MVP` branch was recreated from `origin/main`
  - the stash was reapplied
- This preserved a clean feature branch base before commit/push.

### Repo state at end of 2026-03-26 session

- Branch:
  - `On-Boarding-baseline-MVP`
- HEAD:
  - `a9a2272`
- Remote:
  - `origin/On-Boarding-baseline-MVP`
- PR creation URL recorded during the session:
  - `https://github.com/elkasaby1996-sys/coachos/pull/new/On-Boarding-baseline-MVP`

### Open follow-up items from the 2026-03-26 session

- Build the actual onboarding UI on top of `workspace_client_onboardings`.
- Wire onboarding step save/load behavior into the new JSONB section fields and `step_state`.
- Link the baseline step into onboarding UX using `initial_baseline_entry_id`.
- Add PT review and completion UI that calls the new RPCs.
- Decide how the existing client onboarding screen should be migrated or replaced by the new onboarding flow.

## 2026-03-27 22:45 +03:00 - Add durable session journal workflow

- Branch:
  - `On-Boarding-baseline-MVP`
- Goal:
  - create a persistent in-repo journal that future sessions can use as a handoff and update every time meaningful work is done
- Changes made:
  - added this file as the canonical session handoff document
  - added explicit update rules and a reusable entry template
  - added a repo contribution rule pointing contributors and agents back to this journal
- Files changed:
  - `docs/session-journal.md`
  - `CONTRIBUTING.md`
- Commands/tests run:
  - `Get-ChildItem -Name`
  - `Get-ChildItem docs -Name`
  - `git status --short`
  - `Get-Date -Format "yyyy-MM-dd HH:mm:ss K"`
  - `git log --oneline --decorate -5`
- Struggles / mistakes / blockers:
  - none for the document creation itself
  - exact minute-level timestamps for the prior day were not captured in the live session, so the 2026-03-26 entry is intentionally marked approximate
- Repo state at end:
  - working on `On-Boarding-baseline-MVP`
  - prior feature commit already pushed
  - this documentation update still needs commit/push if the user wants it versioned remotely
- Next step:
  - keep appending to this file at the end of every meaningful session, especially after schema changes, environment changes, or branching/PR actions

## 2026-03-28 09:46 +03:00 - Client onboarding shell and workspace soft gate

- Branch:
  - `On-Boarding-baseline-MVP`
- Goal:
  - implement the client-side onboarding shell for workspace-specific onboarding rows
  - replace the old hard gate with a soft-gate workspace experience
  - reuse the existing baseline subsystem as the onboarding Initial Assessment step
- Changes made:
  - removed the old hard redirect behavior that forced incomplete clients out of the workspace and routed client `/app` directly through `ClientLayout`
  - added a new `src/features/client-onboarding/` frontend module with onboarding types, step logic, Supabase draft/submit helpers, onboarding data hook, soft-gate UI, and the main onboarding shell
  - built a seven-step onboarding flow for Basics, Goals, Training History, Injuries / Limitations, Nutrition & Lifestyle, Initial Assessment, and Review & Submit
  - implemented step progress, resume behavior, autosave/manual draft save, validation, status presentation, and review summary rendering against `workspace_client_onboardings`
  - prefills draft state from `clients` where sensible while keeping draft persistence in `workspace_client_onboardings`
  - integrated the existing baseline flow by linking the onboarding step to `/app/baseline?onboarding=1&returnTo=...`, treating submitted baseline as completion criteria, and returning the client back into onboarding after submission
  - updated the baseline page so onboarding mode does not auto-create a fresh draft when a submitted baseline already exists, invalidates onboarding query state after submission, and shows an onboarding-aware completion state
  - updated invite acceptance to send joined clients into onboarding entry rather than directly to home
- Files changed:
  - `src/features/client-onboarding/types.ts`
  - `src/features/client-onboarding/lib/client-onboarding.ts`
  - `src/features/client-onboarding/lib/client-onboarding-api.ts`
  - `src/features/client-onboarding/hooks/use-client-onboarding.ts`
  - `src/features/client-onboarding/components/client-onboarding-soft-gate.tsx`
  - `src/features/client-onboarding/components/client-onboarding-shell.tsx`
  - `src/components/layouts/client-layout.tsx`
  - `src/pages/client/onboarding.tsx`
  - `src/pages/client/baseline.tsx`
  - `src/pages/public/invite.tsx`
  - `src/routes/app.tsx`
- Commands/tests run:
  - `npm run lint`
  - `npm run format`
  - `npm run build`
  - targeted `npx prettier --write ...` on changed onboarding files
  - `git status --short`
  - `git diff --stat`
  - `Get-Date -Format "yyyy-MM-dd HH:mm:ss K"`
- Struggles / mistakes / blockers:
  - the first pass of the onboarding hook hit a Supabase typing mismatch on `maybeSingle()` and needed explicit return typing
  - the onboarding shell autosave effect needed a callback refactor to satisfy `react-hooks/exhaustive-deps`
  - PT review / activation UI was intentionally not implemented in this phase
  - end-to-end smoke tests were not run in this session
- Repo state at end:
  - branch remains `On-Boarding-baseline-MVP`
  - HEAD before new commit is `a552954`
  - onboarding shell + soft gate changes are present in the working tree and pass lint, format, and build locally
  - working tree is dirty only with the onboarding-related frontend changes listed above
- Next step:
  - build the PT-side review / activation experience that reads submitted onboarding packages and uses the existing backend RPCs
  - add E2E coverage for invite-to-onboarding entry, draft resume, baseline return-to-onboarding flow, and submit-for-review

## 2026-03-28 10:07 +03:00 - PT onboarding review and activation flow

- Branch:
  - `On-Boarding-baseline-MVP`
- Goal:
  - build the PT-side onboarding review and activation experience on top of workspace-specific onboarding rows
  - surface onboarding status in PT workspace views
  - let PT review intake + baseline together, assign first program/check-in, partially activate, and complete onboarding
- Changes made:
  - added a PT onboarding helper module with onboarding select fields, PT-facing status metadata, and activation checklist rules
  - extended shared onboarding types to include first program/check-in and reviewer metadata fields
  - added a dedicated PT onboarding review tab in client detail and surfaced onboarding status in the client header/overview
  - built a PT onboarding review surface that shows intake sections, linked baseline summary, coach review notes, activation checklist, first program assignment, first check-in scheduling, review action, partial activation action, and completion action
  - reused the existing baseline subsystem data instead of rebuilding assessment review logic from scratch
  - synced first program assignment into `workspace_client_onboardings.first_program_template_id` / `first_program_applied_at` whenever PT assigns or switches a program
  - synced first check-in setup into `workspace_client_onboardings.first_checkin_template_id`, `first_checkin_date`, and `first_checkin_scheduled_at` when PT saves the client check-in configuration
  - cleared onboarding first-program tracking when the PT unassigns the program so the checklist stays truthful
  - added onboarding badges to PT client list rows and dashboard client rows
  - added onboarding queue visibility to PT dashboard with counts for in-progress, review queue, partially activated, and completed
  - updated PT roster/dashboard navigation so clients with unfinished onboarding open directly into the onboarding review tab
- Files changed:
  - `src/features/client-onboarding/types.ts`
  - `src/features/client-onboarding/hooks/use-client-onboarding.ts`
  - `src/features/pt-client-onboarding/lib/pt-client-onboarding.ts`
  - `src/features/pt-client-onboarding/components/pt-client-onboarding-tab.tsx`
  - `src/components/ui/coachos/status-pill.tsx`
  - `src/components/pt/clients/ClientListRow.tsx`
  - `src/components/pt/dashboard/ClientRow.tsx`
  - `src/pages/pt/client-detail.tsx`
  - `src/pages/pt/clients.tsx`
  - `src/pages/pt/dashboard.tsx`
- Commands/tests run:
  - `npm run lint`
  - `npm run format`
  - `npm run build`
  - targeted `npx prettier --write ...` on the PT onboarding files
  - `git status --short`
  - `Get-Date -Format "yyyy-MM-dd HH:mm:ss K"`
- Struggles / mistakes / blockers:
  - the existing PT client detail page is very large, so the new onboarding review UI was moved into a feature component to avoid expanding the page file further
  - dashboard and clients pages still use local effect-based loading rather than React Query, so onboarding status refresh there is navigation-driven instead of cache-invalidation-driven
  - end-to-end tests for the PT onboarding review flow were not added in this session
- Repo state at end:
  - branch remains `On-Boarding-baseline-MVP`
  - PT onboarding review/activation UI is implemented in the working tree
  - lint, format, and build all pass locally
- Next step:
  - add E2E coverage for PT review, partial activation, and completion
  - consider moving PT dashboard/client roster loading to React Query if live cross-page onboarding updates become important
  - QA the completion path against real hosted data, especially first-program/check-in edge cases

## 2026-03-28 11:40 +03:00 - Final onboarding integration, legacy handling, and QA pass

- Branch:
  - `On-Boarding-baseline-MVP`
- Goal:
  - complete the final onboarding integration pass so onboarding status feels consistent across the client/PT app
  - reduce conflicting prompts from the older baseline-only flow
  - handle legacy clients safely without blindly marking everyone complete
  - leave behind a concrete QA checklist for the onboarding MVP
- Changes made:
  - updated shared client onboarding status copy so `review_needed`, `submitted`, `partially_activated`, and `completed` read consistently with the actual lifecycle
  - removed the old baseline-only prompt from client home and suppressed the generic profile-completion card until onboarding is completed, reducing duplicate/conflicting asks during onboarding
  - made client reminders onboarding-aware so incomplete onboarding, submitted review state, and partial activation surface through `/app/onboarding` instead of the old standalone baseline reminder
  - updated client check-in empty states so missing first check-in setup points back to onboarding/activation where appropriate instead of telling the client to “finish onboarding” in unrelated error states
  - added a final onboarding integration migration that:
    - upgrades `ensure_workspace_client_onboarding`
    - backfills legacy missing rows into grounded `partially_activated` / `completed` states only when existing baseline + operational setup data justify it
    - adds `ensure_workspace_client_onboardings` for PT workspace surfaces to ensure/load onboarding rows in batches
  - switched PT clients list and PT dashboard onboarding loads to the new batch ensure RPC so legacy clients show onboarding state more reliably in operational views
  - added `docs/onboarding-qa-checklist.md` with a release-style manual test checklist covering client, PT, legacy, and regression flows
- Files changed:
  - `src/features/client-onboarding/lib/client-onboarding.ts`
  - `src/pages/client/home.tsx`
  - `src/components/common/client-reminders.tsx`
  - `src/pages/client/checkin.tsx`
  - `src/pages/pt/clients.tsx`
  - `src/pages/pt/dashboard.tsx`
  - `supabase/migrations/20260328114000_onboarding_final_integration.sql`
  - `docs/onboarding-qa-checklist.md`
  - `docs/session-journal.md`
- Commands/tests run:
  - `npm run lint`
  - `npm run format`
  - `npm run build`
  - `git status --short`
- Struggles / mistakes / blockers:
  - the client check-in page still contains some older copy/branching that had to be patched carefully because of mixed encoding in existing strings
  - automated E2E coverage for the full onboarding lifecycle still was not added in this pass; the QA checklist is manual for now
- Repo state at end:
  - branch remains `On-Boarding-baseline-MVP`
  - final integration/polish changes are in the working tree and lint/format/build all pass locally
- Next step:
  - run lint/format/build and fix anything that shakes loose from the final pass
  - smoke test the client reminder/check-in states and PT legacy backfill behavior against real data

## 2026-03-28 11:48 +03:00 - QA fixes: goals step cleanup and baseline photo storage bucket

- Goal:
  - respond to manual QA feedback from local onboarding testing
  - remove `target timeline` from step 2 so the goals step stays lighter-weight
  - fix baseline photo uploads failing locally with `Bucket not found`
- Changes made:
  - removed `target_timeline` from the client onboarding field state, goals payload builder, step validation, client review summary, and PT onboarding review summary
  - kept the goals step focused on primary goal, optional secondary goals, and motivation / success definition
  - added a storage migration that creates the private `baseline_photos` bucket and adds authenticated storage object policies for client upload/update/delete plus client/PT read access via the baseline/workspace relationship
- Files changed:
  - `src/features/client-onboarding/types.ts`
  - `src/features/client-onboarding/lib/client-onboarding.ts`
  - `src/features/client-onboarding/components/client-onboarding-shell.tsx`
  - `src/features/pt-client-onboarding/components/pt-client-onboarding-tab.tsx`
  - `supabase/migrations/20260328161500_baseline_photo_storage_bucket.sql`
  - `docs/session-journal.md`
- Commands/tests run:
  - `npm run lint`
  - `npm run build`
- Struggles / mistakes / blockers:
  - the bucket error came from a missing storage bucket migration rather than the baseline UI itself, so local testing needs the new migration applied before photo uploads can pass
- Repo state at end:
  - branch remains `On-Boarding-baseline-MVP`
  - frontend checks pass locally
  - local Supabase still needs this new migration applied before retesting photo upload
- Next step:
  - apply the new migration locally with `npm run supabase:db:reset` or create the bucket/policies manually in local SQL if preserving test data matters
  - retest baseline photo upload and the lighter goals step in the browser

## 2026-03-28 12:05 +03:00 - QA fix: require first program and first check-in before onboarding completion

- Goal:
  - close a PT activation gap found in manual QA where onboarding could be marked complete without the required first program assignment and first check-in scheduling
- Changes made:
  - added a stricter PT-side completion guard so the client detail onboarding action refuses completion unless both the first program and the first check-in are already recorded on the onboarding row
  - added a backend `create or replace function` migration for `public.complete_workspace_client_onboarding` that now raises if:
    - no submitted baseline is linked
    - no effective first program assignment exists
    - no effective first check-in schedule exists
  - kept the completion RPC compatible with either already-saved onboarding assignment fields or newly passed values, but no longer allows `completed` with those activation requirements missing
- Files changed:
  - `src/pages/pt/client-detail.tsx`
  - `supabase/migrations/20260328174000_require_program_and_checkin_for_onboarding_completion.sql`
  - `docs/session-journal.md`
- Commands/tests run:
  - `npm run lint`
  - `npm run build`
- Struggles / mistakes / blockers:
  - the UI already modeled program/check-in as required, but the original backend completion RPC still accepted `null` activation parameters, so both layers had to be tightened to fully close the hole
- Repo state at end:
  - branch remains `On-Boarding-baseline-MVP`
  - frontend checks pass locally
  - local Supabase needs the new completion-enforcement migration applied before retesting
- Next step:
  - apply the new migration locally and verify the PT cannot complete onboarding until both the first program and first check-in are set

## 2026-03-28 12:18 +03:00 - Product correction: program/check-in remain optional for onboarding completion

- Goal:
  - align the PT onboarding completion rules with the intended product behavior after clarifying that first program assignment and first check-in scheduling should stay optional
- Changes made:
  - marked `First program assigned` and `First check-in scheduled` as optional checklist items in the PT onboarding review flow
  - removed the temporary PT-side action guard that blocked `Complete onboarding` when those two items were missing
  - added a follow-up migration that re-relaxes `public.complete_workspace_client_onboarding`, so completion once again requires the intake/baseline/review path but not first program or first check-in setup
- Files changed:
  - `src/features/pt-client-onboarding/lib/pt-client-onboarding.ts`
  - `src/pages/pt/client-detail.tsx`
  - `supabase/migrations/20260328181500_relax_onboarding_completion_activation_requirements.sql`
  - `docs/session-journal.md`
- Commands/tests run:
  - `npm run lint`
  - `npm run build`
- Struggles / mistakes / blockers:
  - the prior strict completion guard matched an incorrect assumption rather than the intended product rule, so both frontend and backend had to be relaxed again to keep local testing truthful
- Repo state at end:
  - branch remains `On-Boarding-baseline-MVP`
  - frontend checks pass locally
  - any local DB that already applied the stricter completion SQL must apply the relaxing follow-up SQL to match the current product behavior
- Next step:
  - apply the relaxing completion migration locally and retest that PT can complete onboarding without first program/check-in while those items still remain visible as optional follow-up setup

## 2026-03-28 12:32 +03:00 - Remove first program and first check-in from onboarding

- Goal:
  - remove first program assignment and first check-in scheduling from the onboarding process while keeping those operational workflows available elsewhere in the PT app
- Changes made:
  - removed the first program and first check-in items from the PT onboarding checklist so onboarding completion now focuses on intake, baseline, review, and explicit activation state only
  - removed the first program assignment and first check-in scheduling cards from the PT onboarding review tab
  - stopped syncing program assignments and check-in setup back into `workspace_client_onboardings` from the PT workout/check-in flows
  - added a backend migration that:
    - updates `review_workspace_client_onboarding` so partial activation is no longer inferred from onboarding program/check-in fields
    - adds `partially_activate_workspace_client_onboarding` so partial activation remains an explicit coach action
- Files changed:
  - `src/features/pt-client-onboarding/lib/pt-client-onboarding.ts`
  - `src/features/pt-client-onboarding/components/pt-client-onboarding-tab.tsx`
  - `src/pages/pt/client-detail.tsx`
  - `supabase/migrations/20260328184500_decouple_program_and_checkin_from_onboarding.sql`
  - `docs/session-journal.md`
- Commands/tests run:
  - `npm run lint`
  - `npm run build`
- Struggles / mistakes / blockers:
  - earlier QA patches had briefly tightened onboarding around program/check-in, so this pass had to remove both the visible onboarding UI and the hidden backend coupling behind partial-activation status
- Repo state at end:
  - branch remains `On-Boarding-baseline-MVP`
  - frontend checks pass locally
  - local Supabase needs the new decoupling SQL applied if it has older onboarding status logic loaded
- Next step:
  - apply the decoupling SQL locally and retest the PT onboarding review tab to confirm program/check-in no longer appear there and partial activation still works as an explicit action

## 2026-03-28 12:45 +03:00 - Remove partial activation from onboarding

- Goal:
  - remove `Partially activate` completely from the onboarding lifecycle and collapse the flow down to `review_needed -> submitted -> completed`
- Changes made:
  - removed the `Partially activate` action from the PT onboarding review UI
  - removed the onboarding checklist activation-state item, since there is no longer an intermediate partial activation status to track
  - updated client/PT onboarding status copy, reminders, roster stats, dashboard counts, and fallback status pills so old `partially_activated` rows are treated like reviewed items rather than surfacing a dead status
  - added a migration that:
    - converts existing non-completed `partially_activated` onboarding rows back to `submitted`
    - rewrites `review_workspace_client_onboarding` to never emit `partially_activated`
    - drops `partially_activate_workspace_client_onboarding`
    - updates the legacy ensure/backfill function so it no longer creates new `partially_activated` rows
- Files changed:
  - `src/features/pt-client-onboarding/lib/pt-client-onboarding.ts`
  - `src/features/client-onboarding/lib/client-onboarding.ts`
  - `src/components/common/client-reminders.tsx`
  - `src/components/ui/coachos/status-pill.tsx`
  - `src/pages/pt/clients.tsx`
  - `src/pages/pt/dashboard.tsx`
  - `src/features/pt-client-onboarding/components/pt-client-onboarding-tab.tsx`
  - `src/pages/pt/client-detail.tsx`
  - `supabase/migrations/20260328193000_remove_partially_activated_onboarding_status_usage.sql`
  - `docs/session-journal.md`
- Commands/tests run:
  - `npm run lint`
  - `npm run build`
- Struggles / mistakes / blockers:
  - removing the state cleanly required both UI deletion and follow-up backend normalization, because earlier migrations and QA passes had already introduced `partially_activated` into lifecycle logic and legacy backfill
- Repo state at end:
  - branch remains `On-Boarding-baseline-MVP`
  - frontend checks pass locally
  - local Supabase needs the new cleanup migration applied if older partial-activation SQL has already been run
- Next step:
  - apply the cleanup SQL locally and retest that PT now sees only review and complete actions, with no partial status anywhere in onboarding

## 2026-03-28 13:05 +03:00 - PT completed-onboarding preview polish

- Goal:
  - make the completed PT onboarding tab feel like a clean preview while still allowing note edits when needed
  - keep baseline photo inspection inside the app instead of sending PTs to a separate browser tab
- Changes made:
  - updated the PT onboarding tab so completed onboarding shows preview-oriented copy, a completion summary, and a read-only notes view by default
  - added an `Edit notes` path for completed onboarding, allowing PTs to re-open the notes field, save changes, or cancel back to the persisted review notes
  - replaced the baseline photo external-link behavior with an in-app dialog viewer so uploaded front/side/back photos open full-size in the same tab context
- Files changed:
  - `src/features/pt-client-onboarding/components/pt-client-onboarding-tab.tsx`
  - `docs/session-journal.md`
- Commands/tests run:
  - `npm run lint`
  - `npm run build`
- Struggles / mistakes / blockers:
  - the initial implementation placed new hooks after early-return branches, which build tolerated but lint correctly rejected, so the component state had to be moved up to the top-level hook section
- Repo state at end:
  - branch remains `On-Boarding-baseline-MVP`
  - frontend checks pass locally
- Next step:
  - re-open a completed onboarding in PT, confirm the tab reads like a preview, verify `Edit notes` works, and click each baseline photo to confirm the in-app viewer opens correctly

## 2026-03-28 13:03 +03:00 - Smoke CI alignment for onboarding copy

- Goal:
  - fix the failing pull-request smoke E2E job after the onboarding UI copy changed
- Changes made:
  - traced the failing PR checks and confirmed `quality` was green locally while `smoke-e2e` was failing in the Playwright run step
  - compared the current client onboarding UI against the smoke assertions and found the test was still expecting the older `Set up your profile` heading and `Continue / Finish setup` CTA
  - updated the smoke test so the client onboarding assertion accepts the current shell copy:
    - heading: `Workspace onboarding` or legacy `Set up your profile`
    - CTA: `Next`, `Continue`, or `Finish setup`
  - pushed the CI-only follow-up commit `b275fca` (`Update onboarding smoke assertions`)
- Files changed:
  - `tests/e2e/auth-onboarding.smoke.spec.ts`
  - `docs/session-journal.md`
- Commands/tests run:
  - `git status --short`
  - `Get-Content .github/workflows/ci.yml`
  - `npm run lint`
  - `npm run format`
  - `npm run build`
  - `npx playwright test tests/e2e/auth-onboarding.smoke.spec.ts --list`
  - `git push origin On-Boarding-baseline-MVP`
- Struggles / mistakes / blockers:
  - GitHub did not expose the full public smoke logs, so the failure had to be narrowed down by comparing the smoke specs against the current UI and the available Actions annotation
  - the repo `quality` fix and the smoke fix were separate; the smoke failure was not a formatter/build problem
- Repo state at end:
  - branch remains `On-Boarding-baseline-MVP`
  - latest pushed commit is `b275fca`
  - local working tree is clean except for local Supabase scratch folders (`supabase/.branches/`, `supabase/snippets/`)
- Next step:
  - let GitHub rerun the PR checks on `b275fca`
  - if `smoke-e2e` still fails, isolate the next stale selector or environment-specific flow break from the remaining smoke specs

## 2026-03-28 13:13 +03:00 - Tighten onboarding smoke selector to actual heading

- Goal:
  - address the remaining likely smoke mismatch after the first onboarding test copy update
- Changes made:
  - inspected the current onboarding shell markup and confirmed the visible onboarding eyebrow text is not the page heading
  - updated the smoke assertion to target the real onboarding `<h1>` text: `Guided onboarding for your coaching workspace`
  - widened the secondary CTA assertion so the smoke still passes if the first onboarding step shows `Next` or the shell-level `Save and finish later` action
- Files changed:
  - `tests/e2e/auth-onboarding.smoke.spec.ts`
  - `docs/session-journal.md`
- Commands/tests run:
  - `Get-Content src/features/client-onboarding/components/client-onboarding-shell.tsx`
  - `npm run lint`
  - `npx playwright test tests/e2e/auth-onboarding.smoke.spec.ts --list`
  - `npx prettier --write tests/e2e/auth-onboarding.smoke.spec.ts`
- Struggles / mistakes / blockers:
  - the first smoke fix still used the onboarding eyebrow copy as if it were the heading, so this follow-up pass had to align the selector with the actual DOM semantics
- Repo state at end:
  - branch remains `On-Boarding-baseline-MVP`
  - tracked changes are limited to the smoke spec and this journal update
- Next step:
  - push the selector correction and watch the next `smoke-e2e` rerun for a different failing spec if one still exists

## 2026-03-28 13:18 +03:00 - Fix PT workout smoke selector for current client detail layout

- Goal:
  - address the remaining `smoke-e2e` failure in the PT workout assignment test
- Changes made:
  - reviewed the current PT client detail workout tab and confirmed the smoke was using a brittle `label -> sibling select` locator that no longer matched the rendered card structure reliably
  - updated the smoke to scope itself to the `Schedule workout` card, then target:
    - the first `select` inside that card for workout template choice
    - the first `input[type="date"]` inside that card
    - the `Assign workout` button inside that card
  - kept the existing retry/navigation behavior, but changed the visibility gate to wait for the card-scoped select instead of the old standalone label selector
- Files changed:
  - `tests/e2e/pt-assign-workout.smoke.spec.ts`
  - `docs/session-journal.md`
- Commands/tests run:
  - `npm run lint`
  - `npx playwright test tests/e2e/pt-assign-workout.smoke.spec.ts --list`
  - `Get-Content src/pages/pt/client-detail.tsx`
- Struggles / mistakes / blockers:
  - the smoke failure was not in the workout feature logic itself; it was caused by a selector that encoded an outdated DOM relationship rather than the visible workflow surface
- Repo state at end:
  - branch remains `On-Boarding-baseline-MVP`
  - tracked changes are limited to the PT workout smoke spec and this journal update
- Next step:
  - push the PT workout smoke selector fix and rerun PR CI
  - if smoke still fails after this, inspect whether the next issue is a real runtime precondition rather than a stale selector

## 2026-03-28 13:24 +03:00 - Tighten PT workout smoke to heading-anchored card lookup

- Goal:
  - fix the remaining likely flake in the PT workout smoke after the first card-scoped selector change
- Changes made:
  - reviewed the UI component primitives and confirmed `CardTitle` renders as a real heading element
  - replaced the generic `div`-filtered `Schedule workout` card locator with a heading-anchored lookup:
    - find the `Schedule workout` heading
    - walk up to the nearest `surface-panel` ancestor
    - query the select/date/button within that exact card
  - this removes the risk of Playwright matching a larger ancestor container that happens to contain the workout card text and then choosing the wrong `select`
- Files changed:
  - `tests/e2e/pt-assign-workout.smoke.spec.ts`
  - `docs/session-journal.md`
- Commands/tests run:
  - `npm run lint`
  - `npx prettier --write tests/e2e/pt-assign-workout.smoke.spec.ts`
  - `npx playwright test tests/e2e/pt-assign-workout.smoke.spec.ts --list`
  - `Get-Content src/components/ui/card.tsx`
- Struggles / mistakes / blockers:
  - the first PT workout smoke fix was still too loose because it relied on text containment over a generic container query rather than anchoring to the actual card heading structure
- Repo state at end:
  - branch remains `On-Boarding-baseline-MVP`
  - tracked changes are limited to the PT workout smoke spec and this journal update
- Next step:
  - push this heading-anchored selector refinement and rerun CI
  - if the workflow still fails, treat the next failure as a likely runtime/data precondition issue rather than a stale selector
