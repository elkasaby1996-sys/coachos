# Exercise Library runtime and release evidence

## 1. Scope and commit/branch

- Gates: PR-EXLIB-07A — Exercise Library Runtime and Release Gate; PR-EXLIB-07B — Workout Template Exercise Persistence Repair.
- Branch: `EXERCISELIBRARY`.
- PR-EXLIB-07A verified commit: `7aae5dc9f3ae639980e14583de2263f0528a647f` (`7aae5dc`).
- PR-EXLIB-07B base commit: `d1cb51083c5187a7e9b31dc529e2f44983c804eb` (`d1cb510`); the repair evidence covers the unstaged working-tree patch described below.
- Verification date: 2026-09-01.
- This run performed local-only verification. It did not modify a remote Supabase project.

## 2. Required tracked-file inventory

`git status --short` was clean before evidence was written. `git ls-files -o --exclude-standard` returned zero paths. The required tracked inventory was:

```text
docs/exercise-dataset-gateway.md
docs/third-party-artwork-provenance.md
licenses/react-muscle-highlighter-MIT.txt
src/components/pt/anatomical-muscle-selector/accessible-muscle-list.tsx
src/components/pt/anatomical-muscle-selector/anatomical-figure.tsx
src/components/pt/anatomical-muscle-selector/anatomical-muscle-selector.css
src/components/pt/anatomical-muscle-selector/anatomical-muscle-selector.tsx
src/components/pt/anatomical-muscle-selector/anatomy-registry.ts
src/components/pt/anatomical-muscle-selector/artwork/artwork-adapter.ts
src/components/pt/anatomical-muscle-selector/artwork/react-muscle-highlighter-male-back.ts
src/components/pt/anatomical-muscle-selector/artwork/react-muscle-highlighter-male-front.ts
src/components/pt/anatomical-muscle-selector/artwork/repsync-anatomy-overlays.ts
src/components/pt/anatomical-muscle-selector/index.ts
src/components/pt/exercise-library/exercise-library-browser.tsx
src/components/pt/exercise-library/index.ts
src/components/pt/exercise-picker/exercise-picker-filter-panel.tsx
src/components/pt/exercise-picker/exercise-picker-results.tsx
src/components/pt/exercise-picker/exercise-picker-selectable-row.tsx
src/components/pt/exercise-picker/exercise-picker-selection-tray.tsx
src/components/pt/exercise-picker/exercise-picker-toolbar.tsx
src/components/pt/exercise-picker/exercise-picker.tsx
src/components/pt/exercise-picker/index.ts
src/lib/exercise-import.ts
src/lib/exercise-picker.ts
supabase/functions/_shared/exercise-dataset-gateway.ts
supabase/functions/exercise-dataset-search/index.ts
tests/unit/exercise-picker-contract.test.ts
tests/unit/exercise-picker.test.ts
```

Selector, taxonomy, classification, gateway, library-page, query-contract, and artwork provenance tests/files needed by the build were also confirmed tracked. No production source references `supabase/.temp` or the `EXLIB07A` fixture namespace. A detached clean worktree at the verified commit installed 444 packages using `npm ci --no-audit --no-fund`, remained clean, and built without untracked or ignored source.

## 3. Migration status

Local Supabase was rebuilt from migrations for PR-EXLIB-07A. PR-EXLIB-07B then applied the forward-only `20260901160000_workout_template_exercise_persistence_repair.sql` migration locally. The migration replaces only `prevent_assigned_workout_exercise_rewrite()` so a permitted `UPDATE` returns `NEW`; active-delivery `UPDATE`/`DELETE` protection and existing RLS policies remain intact. No historical migration was edited and no remote Supabase command was run.

## 4. Edge Function configuration names

The function reads these configuration names; values are intentionally omitted:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EXERCISE_DATASET_BASE_URL`
- `EXERCISE_DATASET_API_KEY`
- `EXERCISE_DATASET_API_KEY_HEADER`
- `EXERCISE_DATASET_API_HOST`

The existing ignored local function env file did not contain the `EXERCISE_DATASET_*` provider configuration names. A disposable ignored env file and deterministic local upstream were used only for stub verification.

## 5. Authentication runtime results

Requests passed through the locally served `exercise-dataset-search` Edge Function:

| Case                                       | Result                        | Safe evidence                                                                      |
| ------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------- |
| No authorization header                    | 401                           | Rejected by the gateway before provider access.                                    |
| Invalid token                              | 401                           | Rejected by the gateway before provider access.                                    |
| Authenticated client-only account          | 403 `forbidden`               | Client remained isolated from provider access.                                     |
| Authenticated PT owner, real config absent | 503 `provider_not_configured` | Authorization passed and reached provider configuration.                           |
| Authenticated PT coach, real config absent | 503 `provider_not_configured` | Existing PT membership policy allowed the request to reach provider configuration. |
| PT owner against local stub                | 200                           | First page reached the deterministic upstream.                                     |
| PT coach against local stub                | 200                           | Existing PT membership policy permitted the same bounded route.                    |

Observed stub timings were bounded (approximately 124–534 ms in the recorded calls). A forced next-page upstream failure returned 502 `provider_unavailable` with a correlation ID.

## 6. Real provider result

**Not proven.** No valid current-provider configuration was locally available. No key was invented and no remote project was changed. The real-provider first page, live provider normalization, live cursor, and live import therefore remain release blockers.

The local stub proves the application/Edge Function route, authorization, raw payload forwarding, cursor propagation, provider-ID string handling, UI normalization, deduplication, and error mapping. It is not evidence of current-provider availability or compatibility.

## 7. Picker search and pagination results

- Headed verification used the actual workout-template `Add exercises` dialog.
- Opening on **My Library** did not change the Edge Function event count. Switching to **Provider Catalog** increased it by exactly one, proving lazy first-page loading for that transition.
- Stub page 1 returned two rows with a next cursor. One **Load more** action made one cursor request. Stub page 2 returned two rows including one repeated provider ID; the UI retained three unique provider records.
- No automatic cursor crawl occurred. The next page was only fetched after the explicit button action.
- A forced third-page failure preserved all three prior rows, displayed `Couldn’t load the next provider page`, and retained the **Load more** retry control.
- My Library and inline custom creation remained usable independently of the provider results.
- Latest-request-wins behavior for rapid search/filter changes is covered by focused tests, but was not proven against the unavailable real provider.

## 8. Reconciliation and import results

- Exact source reconciliation: after importing provider ID `stub-row-7002`, the provider row displayed **Already added** and was disabled. Its workout-template row referenced the internal exercise UUID, not the provider ID.
- Name conflict: a controlled provider row used a new provider ID with the normalized name of `EXLIB07A Inline Custom`. The picker displayed **Name conflict — review the saved exercise in My Library**, disabled the row, and created no silent merge.
- New provider import: the controlled `EXLIB07A Stub Press` import persisted `source=exercise_dataset`, `source_exercise_id=7001` as a string, a non-null `source_payload`, `primary_muscle_keys={triceps}`, `secondary_muscle_keys={anterior_deltoids}`, and taxonomy version 1.
- A second new provider row imported during the three-way add and resolved to a `public.exercises.id` UUID before WTE insertion.
- These are deterministic local-stub results. Real-provider reconciliation/import remains unproven.

## 9. Mixed add and reload results

A fresh QA template started with zero WTE rows. In one headed submission the picker selected:

1. existing saved `EXLIB07A Stub Press`,
2. inline-created custom `EXLIB07A Inline Three-Way`, and
3. unsaved provider `EXLIB07A Stub Squat`.

After **Add 3 selected**, the template contained three rows with internal UUID `exercise_id` values and sort orders 10, 20, and 30. No raw provider ID appeared in WTE. Reload rendered all three rows. Opening the picker again showed already-added rows disabled and **Add selected** disabled when the selection was empty, preventing repeat submission. The locked source contract still asserts the initial WTE insert payload is exactly `{ workout_template_id, exercise_id, sort_order }`.

## 10. Builder prescription/DnD/superset regression and repair

PR-EXLIB-07A reproduced the failure: the optimistic grouped UI appeared correct, but the database retained the previous `sort_order`, `superset_group`, and prescription values, so reload restored the old layout. PR-EXLIB-07B proved the cause was the active-delivery protection trigger, not the insert contract, WTE row ID, RLS policy, cache invalidation, or a later restoring write. The `BEFORE UPDATE OR DELETE` trigger returned `OLD` for every permitted unassigned-template update. PostgreSQL therefore reported a successful update while silently substituting the old row.

The forward migration now returns `NEW` only for permitted `UPDATE` operations and retains `OLD` for permitted `DELETE` operations. The builder also requests returned WTE IDs and verifies the exact expected ID set for single edit, delete, drag/superset, and bulk edit. Headed verification on a fresh unassigned template proved sets, reps, rest, tempo, RPE, video URL, notes, order, and superset grouping after full reload. Nullable prescription values remained cleared after save and reload. Creating, changing/removing, and reloading superset state worked, and preview reflected the persisted prescription and order.

## 11. Responsive and accessibility smoke

The completed Exercise Library was checked headed at 1440 px, 768 px, and 375 px. At each width the URL-backed `muscle=biceps` selection remained visible. At 375 px the collapsible summary showed **Selected: Biceps**, opened with Enter, closed with Space, retained the selected muscle and URL, and showed no visible horizontal clipping in the captured viewport. The selector remained exposed as an `Anatomical muscle selector` region with keyboard-addressable tabs and muscle buttons. The temporary viewport override was reset after verification.

## 12. Network and secret inspection

- Edge Runtime logs contained zero matches for authorization/bearer strings, JWT-shaped values, or the provider secret configuration name.
- The production bundle contained zero files matching `VITE_EXERCISE_DATASET`, `EXERCISE_DATASET_API_KEY`, or `EXERCISE_DATASET_API_HOST`.
- Browser traffic used the Supabase Edge Function; the frontend contains no direct provider base URL or provider credential.
- UI failures returned mapped messages/codes rather than raw provider stack traces.
- No provider key, bearer token, authorization header, provider-secret value, or local env file was added to Git or this evidence document.

## 13. Known risks

- Provider import and WTE insertion remain separate non-transactional operations. A successful import followed by failed WTE insertion can leave a valid owner-library exercise without a template row. The proposed atomic resolve-and-add RPC remains intentionally out of scope.
- There is no WTE uniqueness constraint; duplicate prevention remains application-level.
- Real-provider availability and compatibility are unproven in this environment.
- Multi-row drag and bulk saves still use bounded individual updates rather than a transaction/RPC. Exact returned-ID-set checking, authoritative refetch, and optimistic rollback prevent false success, but transaction-level all-or-nothing behavior remains a hardening opportunity.
- One unrelated pre-existing auth-component whitespace contract fails in the full unit suite. The relevant PR-EXLIB-07B and existing Exercise Library/picker/selector/provider suites are green; the stale Exercise Library page contract itself was repaired semantically.

## 14. Rollback sequence

1. Stop the local `exercise-dataset-search` serve process and remove any disposable ignored stub/env files.
2. Remove deterministic QA templates, WTE rows, exercises, workspace memberships, workspace, and auth identities.
3. For a deployed PR, revert the PR merge commit using the repository’s normal `git revert` workflow and rebuild/redeploy the previous frontend and Edge Function revisions.
4. Remove the PR’s Edge Function configuration only if it was introduced specifically for the reverted release; do not expose values while doing so.
5. PR-EXLIB-07A requires no database rollback because it added no migration. If PR-EXLIB-07B must be reverted, add a new forward migration restoring the prior function behavior only after evaluating the original data-loss bug; do not edit an applied historical migration.

## 15. Release recommendation

**Blocked.** Acceptance still requires a successful real-provider request, and no valid local provider configuration was available. The builder persistence failure and stale Exercise Library page-contract failure are repaired and locally verified, but they do not remove the real-provider release blocker. Provider choice, canonical taxonomy, anatomical artwork, prescription model, programs, assignment RPCs, runner behavior, set logging/history, and client-personal exercise behavior were not changed during this repair.

## 16. PR-EXLIB-07B persistence repair evidence

### Confirmed corrective boundary

The defect boundary was `public.prevent_assigned_workout_exercise_rewrite()`: its permitted `UPDATE` path returned `OLD`. The repair changes that return value to `NEW` and adds application-level affected-row assertions. It does not change WTE RLS policy membership, delivery permission semantics, exercise identity, or the initial insert payload.

| Operation                                     | Builder function     | Row identity/filter                               | Expected returned IDs     | Optimistic |
| --------------------------------------------- | -------------------- | ------------------------------------------------- | ------------------------- | ---------- |
| Single prescription/save and superset removal | `handleEditSave`     | WTE `selectedRow.id`; `.eq("id", selectedRow.id)` | exactly that WTE ID       | No         |
| Drag reorder and superset creation/change     | `handleDragEnd`      | each changed WTE `id`; `.eq("id", id)`            | exact changed WTE-ID set  | Yes        |
| Bulk prescription edit                        | `handleBulkEditSave` | each selected WTE `id`; `.eq("id", id)`           | exact selected WTE-ID set | No         |
| Delete                                        | `handleDelete`       | WTE `selectedRow.id`; `.eq("id", selectedRow.id)` | exactly that WTE ID       | No         |
| Initial add                                   | `handleAddExercise`  | new row; no WTE ID exists yet                     | inserted row count        | No         |

The initial add payload remains exactly `{ workout_template_id, exercise_id, sort_order }`. Prescription/layout updates never write `exercise_id`.

### Authenticated local runtime results

| Actor/case               | Delivery-management permission              | PostgREST result        | Returned WTE IDs  | Stored outcome                                                                |
| ------------------------ | ------------------------------------------- | ----------------------- | ----------------- | ----------------------------------------------------------------------------- |
| PT owner                 | Allowed                                     | 200, no error           | exact intended ID | Prescription fields persisted and read back.                                  |
| Authorized PT coach      | Allowed                                     | 200, no error           | exact intended ID | Coach edit persisted and read back.                                           |
| Read-only viewer         | Denied                                      | 200, no PostgREST error | zero IDs          | Shared assertion reports an explicit failure; stored values remain unchanged. |
| Wrong/nonexistent WTE ID | Not applicable                              | 200, no PostgREST error | zero IDs          | Shared assertion reports an explicit failure.                                 |
| Active-delivery template | Permission check reached protection trigger | PostgreSQL `P0001`      | no changed IDs    | Update rejected and stored values remain unchanged.                           |

The safe runtime used template `00000000-0000-4000-8000-000000000830`. The owner (`7f817b0a-3d04-4aa5-b9de-0bb35da7f7f3`) updated WTE `5e7ecb2b-9c02-43c6-843e-b9ab10cc0ce5`; the authorized coach (`ac77695c-8b14-44a5-9f44-8d2dec605baa`) updated WTE `38d94602-dff4-4e43-8efe-97a1e2475ef8`; and the read-only viewer (`ca3ee787-d25a-4e6e-bdca-132c72cc0e0b`) received zero returned rows. The owner update payload named `sets`, `reps`, `rest_seconds`, `tempo`, `rpe`, `video_url`, `notes`, `superset_group`, and `sort_order`. Before the update those values were null/default; after the update a new authenticated read returned the intended values. The viewer and wrong-ID cases returned empty arrays. No bearer token or secret value was recorded.

### Field, DnD, superset, and reload results

- Owner and coach database reads proved `sets`, `reps`, `rest_seconds`, `tempo`, `rpe`, `video_url`, `notes`, `sort_order`, and `superset_group` persistence.
- Headed owner verification saved `sets=6`, `reps=12`, `rest_seconds=75`, `tempo=2-0-2`, `rpe=7`, a video URL, and notes; a full reload reopened the dialog with those exact values.
- Clearing nullable reps, rest, tempo, RPE, video URL, and notes persisted as null and remained blank after a full reload; the non-null sets value remained 6.
- Headed drag-and-drop persisted the exact reordered WTE-ID sequence and superset group after reload. A later edit removed/changed the selected row's group, and another reload retained the change.
- Preview displayed the persisted order, grouping, and prescription. No provider request was needed.
- A read-only viewer attempted an optimistic drag. The server returned zero WTE IDs, the builder restored/refetched authoritative rows, and an accessible actionable alert replaced the false-success state.
- The internal exercise UUIDs and WTE UUIDs remained unchanged throughout prescription and layout edits.

### Automated verification and cleanup

- `npm run supabase:db:test`: 2 SQL files, 40 pgTAP assertions passed; the new authenticated WTE file contributes 24 assertions covering owner, coach, viewer denial, field readback, nullable clearing, identity, layout, and active-delivery protection.
- Focused Vitest mutation/assertion and Exercise Library page-contract coverage passed. Existing picker, library, selector, provider gateway, taxonomy, and exercise-domain focused suites passed.
- `npm run build`, `npm run lint`, migration lint, formatting checks, and `git diff --check` were run against the repair patch; final results are recorded in the PR handoff.
- Disposable template, WTE, exercise, workspace, membership, and auth records were removed. Verification returned zero remaining template rows, exercise rows, and QA users. Disposable browser/runtime artifacts were also removed.
- The relevant clean-checkout suite is green. The repository-wide unit run still exposes the unrelated pre-existing auth-component whitespace contract noted in Known risks.

The overall release verdict remains **Blocked**. A successful real-provider request is still unproven and remains an independent release blocker as described in section 6.

## 17. PR-EXLIB-07C real-provider release-finalization gate

Verification date: 2026-09-01. Branch: `EXERCISELIBRARY`. Base commit: `d1cb51083c5187a7e9b31dc529e2f44983c804eb` (`d1cb510`). This gate inspected local/private configuration and local migration state only. It did not contact, configure, migrate, or deploy a staging or production Supabase project.

### Repository and migration integrity

- The PR-EXLIB-07B forward migration is present and is applied to the local Supabase database as migration `20260901160000`.
- Target staging migration status remains unknown because no named staging project or remote-operation authorization was provided.
- Four required PR-EXLIB-07B files remain untracked: `src/lib/workout-template-exercise-mutations.ts`, `supabase/migrations/20260901160000_workout_template_exercise_persistence_repair.sql`, `supabase/tests/workout_template_exercise_persistence.sql`, and `tests/unit/workout-template-exercise-mutations.test.ts`.
- The builder, page-contract test, and this evidence document are tracked but modified and unstaged. The subsequent requested muscle-list disclosure change is also modified and unstaged.
- Production source contains no reference to `supabase/.temp` or an `EXLIB07A`, `EXLIB07B`, or `EXLIB07C` fixture namespace. The only private config file found, `.env.local`, is ignored by Git.
- The prior PR-EXLIB-07B detached clean-checkout proof passed focused tests, lint, and build, but the current required release artifacts are not yet tracked. PR-EXLIB-07C therefore cannot claim a tracked clean checkout or release-ready Git state.

### Server-only provider configuration presence

Only presence was checked; no value was printed, copied, or reused.

| Required server-only name         | Configured locally |
| --------------------------------- | ------------------ |
| `EXERCISE_DATASET_BASE_URL`       | No                 |
| `EXERCISE_DATASET_API_KEY`        | No                 |
| `EXERCISE_DATASET_API_KEY_HEADER` | No                 |
| `EXERCISE_DATASET_API_HOST`       | No                 |

The ignored `.env.local` still contains the four former browser-prefixed `VITE_EXERCISE_DATASET_*` names. Their values were not inspected and were not used. A new server-only provider credential was not available, and this gate did not restore frontend credential usage.

### Runtime phases not executed

The task requires the gate to stop with a Blocked verdict when a valid real-provider credential cannot be obtained. Consequently, PR-EXLIB-07C did not serve the gateway with a real credential; make owner, coach, client-only, invalid-token, or no-token calls against the real provider; request a real first page; exercise real pagination; import or reconcile a real provider item; create mixed-add QA records; or perform new browser/function-log inspection. No status code, result count, elapsed time, correlation ID, cursor, provider record, or import result is claimed for the real provider.

The authenticated deterministic-stub results from PR-EXLIB-07A and the local WTE persistence results from PR-EXLIB-07B remain valid evidence for their respective boundaries, but they are not substitutes for real-provider proof.

### Cleanup, risks, and rollback

- No PR-EXLIB-07C QA user, membership, workspace, exercise, template, or WTE row was created, so no new runtime QA cleanup was required.
- Accepted architectural risks remain the non-transactional provider-import/WTE sequence, application-level duplicate prevention, and non-transactional multi-row WTE saves with exact returned-ID-set checking and authoritative recovery.
- No PR-EXLIB-07C deployment, secret change, or migration was performed, so rollback is limited to discarding this evidence-only update. Existing PR-EXLIB-07A/07B rollback guidance remains in section 14.

### Final recommendation

**Blocked.** Required artifacts are not yet tracked, staging migration status is unknown, the four server-only provider configuration names are absent locally, and no authorized staging target or newly issued provider credential was supplied. Real-provider authentication, first-page success, normalization, pagination, reconciliation, import, mixed add, and secret/log inspection therefore remain unproven.
