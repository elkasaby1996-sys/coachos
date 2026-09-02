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

**Passed locally.** The current server-only configuration returned a real 24-record page for both a PT owner and authorized PT coach. Real records normalized and imported successfully. After mapping RepSync's neutral cursor to the provider's documented `after` parameter, an explicit browser next-page request advanced the catalog from 24 to 48 distinct records.

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

**Runtime gate passed; deployment credential rotation required.** The configured current provider returns successful authenticated pages, and real normalization, pagination, reconciliation, import, mixed WTE addition, and persistence are proven. The local testing credential was exposed outside the application and must be revoked and replaced before staging or production use. Provider choice, canonical taxonomy, anatomical artwork, prescription model, programs, assignment RPCs, runner behavior, set logging/history, and client-personal exercise behavior were not changed.

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

Verification date: 2026-09-01. Branch: `EXERCISELIBRARY`. Base commit: `ef40bea` (`fix(exercises): support current provider gateway config`). This gate used local Supabase and the ignored `supabase/.env.local` only. It did not configure, migrate, or deploy a staging or production Supabase project.

### 2026-09-02 PR-EXLIB-07C-A resumption

The real-provider gate was rerun from the current working tree using only local
Supabase and the ignored server-only environment file. No environment value,
request authorization value, raw provider record, or remote Supabase setting
was printed, copied, or committed.

- Missing and invalid authentication returned 401; a disposable client-only
  identity returned 403. Disposable PT owner and authorized PT coach identities
  each received HTTP 200 from the real provider boundary.
- The bounded first page contained 24 normalized records. All provider IDs were
  strings and all 24 records produced supported canonical anatomy context. A
  synthetic unknown-anatomy seam remained explicitly unmapped.
- One explicit cursor request returned a second bounded 24-record page. The
  runtime harness issued exactly one next-page request and performed no cursor
  crawl.
- Source-ID reconciliation reused the existing internal exercise UUID. A
  name-only collision remained `name_conflict`. A new real-provider exercise
  persisted provider source identity, source payload, and canonical anatomy
  arrays in `public.exercises`.
- A disposable saved/custom/provider three-way selection produced three WTE
  rows, all referencing internal `public.exercises.id` UUIDs. The initial row
  shape remained exactly `{ workout_template_id, exercise_id, sort_order }`.
- Reload preserved the three exercises. Prescription fields, reordered rows,
  and a two-row superset persisted after a fresh authenticated read.
- The running local database initially lacked the already-tracked
  `20260901160000_workout_template_exercise_persistence_repair.sql` migration.
  The gate reproduced the old false-success ordering behavior, applied that
  pending migration locally, and then passed without a new migration or source
  correction.
- Browser measurement recorded zero exercise-search or metadata operations on
  **My Library**. Opening **Provider Catalog** produced one bounded
  `exercise_dataset_search` operation plus the four intentional metadata
  operations. One **Load more** click produced one search operation; the
  following idle interval produced zero additional searches.
- Production assets contained zero matches for the configured provider
  credential, provider host, or provider secret names. Frontend source contained
  no direct provider host. Structured function-output scans contained no
  authorization, bearer, provider-secret-name, or JWT-shaped value.
- Cleanup verification returned zero disposable WTE rows, templates, exercises,
  workspaces, memberships, and auth identities for the runtime namespace.

Resumption verdict: **the local real-provider runtime gate passes**. No provider
adapter or gateway correction was supported by the runtime evidence.

### Repository and migration integrity

- The PR-EXLIB-07B forward migration is present and is applied to the local Supabase database as migration `20260901160000`.
- Target staging migration status remains unknown because no named staging project or remote-operation authorization was provided.
- PR-EXLIB-07B, the intentional muscle-list disclosure refinement, and the prior blocked-gate evidence are tracked in commits `69178c6`, `6a65a25`, and `226f53b` respectively. The server-only provider compatibility change is tracked in `ef40bea`.
- This run adds only the evidence-supported provider query adapter in the shared gateway, its focused contract test, gateway documentation, and release evidence. It does not change provider choice, taxonomy, artwork, information architecture, the workout insert contract, programs, assignments, runner behavior, logging/history, or client-personal exercises.
- Production source contains no reference to `supabase/.temp` or an `EXLIB07A`, `EXLIB07B`, or `EXLIB07C` fixture namespace. The private provider config file `supabase/.env.local` is ignored by Git, and no ignored source file is required by the build.
- The PR-EXLIB-07B detached clean-checkout proof passed focused tests, lint, and build. The local PR-EXLIB-07C runtime gate now passes, including distinct forward pagination.

### Server-only provider configuration presence

Only presence was checked; no value was printed, logged, copied into source, or committed.

| Required server-only name         | Configured locally |
| --------------------------------- | ------------------ |
| `EXERCISE_DATASET_BASE_URL`       | Yes                |
| `EXERCISE_DATASET_API_KEY`        | Yes                |
| `EXERCISE_DATASET_API_KEY_HEADER` | Yes                |
| `EXERCISE_DATASET_API_HOST`       | Yes                |

| Current-provider server-only name | Configured locally |
| --------------------------------- | ------------------ |
| `OPEN_WEARABLES_API_URL`          | Yes                |
| `OPEN_WEARABLES_API_KEY`          | Yes                |

The generic names were populated locally from the ignored legacy local configuration without printing or committing values. They take precedence over the provider-specific fallback tracked in `ef40bea`. The legacy browser-prefixed names were not restored to application code and were used only as a local migration source. A new provider key remains required before staging or production deployment.

### Authentication and real-provider boundary

| Actor               | Status | Safe error contract                 | Correlation ID                         | Elapsed  |
| ------------------- | ------ | ----------------------------------- | -------------------------------------- | -------- |
| Missing token       | 401    | `unauthenticated`                   | `e729f42f-5c1d-46ef-9f9d-dd9f53f8e98f` | 506 ms   |
| Invalid token       | 401    | Local Supabase JWT rejection        | Not emitted by the function            | 6 ms     |
| Client-only account | 403    | `forbidden`                         | `fd804b0f-ecbb-4d63-b2b2-6127d15c25b8` | 65 ms    |
| PT owner            | 200    | Success, 24 real records and cursor | `a31e8c91-72f7-428a-9367-15bce0082591` | 1,680 ms |
| Authorized PT coach | 200    | Success, explicit cursor request    | `181a5672-779a-490c-b7f1-6756b815649e` | 341 ms   |

The owner first-page request was bounded by the gateway's ten-second provider timeout and returned in 1.68 seconds. The coach used the returned cursor explicitly and received a structurally valid HTTP 200 page.

### Real normalization, reconciliation, import, and WTE persistence

- All 24 first-page provider IDs normalized as strings.
- Real provider muscle labels mapped to canonical body-region, primary-muscle, and secondary-muscle keys. The sampled mapping retained one unknown label as unmapped evidence rather than silently changing the taxonomy.
- Import persisted `source = 'exercise_dataset'`, the exact string `source_exercise_id`, the exact provider payload, and the canonical muscle fields in `public.exercises`.
- Re-reading the imported row classified the same provider ID as an exact-source match and resolved it to the existing exercise UUID.
- A separate manual exercise with only the same normalized name classified as `name_conflict`; the picker returned no selectable entry and did not merge it.
- A second new provider record imported successfully. A mixed saved-import/custom/new-provider selection inserted three WTE rows using only `{ workout_template_id, exercise_id, sort_order }`.
- A fresh authenticated read returned all three exercise UUIDs in the persisted reordered sequence. Sets, reps, rest, tempo, RPE, notes, sort order, and superset grouping matched the stored values after reload.

### Explicit Provider Catalog pagination result

- Provider documentation identified `after` and `before` as the exercise-list cursor parameters. The gateway maps RepSync's forward-only neutral `cursor` to `after`; it does not expose unused reverse pagination.
- Reloading **Provider Catalog** produced one successful local gateway event (`6de44a4c-e3c3-4981-94d0-98466cfc1ca4`, 612 ms) and rendered 24 real records.
- Clicking **Load more** produced one explicit `after` request and a second successful gateway event (`a284a480-8000-4466-850f-03d25751f2f2`, 328 ms).
- The rendered catalog advanced from 24 to 48 distinct provider records and continued to expose **Load more** for the next cursor. No direct browser-to-provider request was introduced.

### Network, asset, and log inspection

- Browser actions produced matching local `exercise-dataset-search` correlation events; no browser-to-provider request was made.
- A scan of 677 frontend source/public/build files found zero files containing any configured provider secret value. Production assets contain no server-only provider credential value.
- Function logs recorded only correlation ID, operation, provider label, safe status category, elapsed time, safe error code, and authenticated user ID. Observed logs contained no authorization header, bearer token, API key, or provider secret value.
- The browser console recorded no warning or error during the initial Provider Catalog load or explicit cursor request.

### Automated verification

- The disposable real-provider runtime test passed normalization, reconciliation, conflict, import, mixed-add, reload, prescription, reorder, and superset assertions. The corrected provider query mapping is covered by the gateway contract suite.
- The production build passed and transformed 3,435 modules.
- The focused Exercise Library/WTE suite is green: 10 files and 109 tests. Local database tests are green: 2 files and 40 pgTAP assertions.
- Formatting, lint, and `git diff --check` were rerun after the evidence update.

### Cleanup, risks, and rollback

- Disposable owner, coach, and client-only users plus their workspace, memberships, client relationship, imported/custom/conflict exercises, template, and WTE rows were removed. Aggregate verification returned zero remaining QA users, workspaces, memberships, clients, exercises, and workout templates. The temporary runtime state and scripts were removed.
- Accepted architectural risks remain the non-transactional provider-import/WTE sequence, application-level duplicate prevention, and non-transactional multi-row WTE saves with exact returned-ID-set checking and authoritative recovery.
- No PR-EXLIB-07C deployment, remote secret change, or migration was performed. To roll back the local provider adapter, revert the shared gateway, gateway test, configuration documentation, and evidence patch; existing PR-EXLIB-07A/07B rollback guidance remains in section 14.

### Final recommendation

**Local runtime gate passed; staging/production remains blocked pending credential rotation.** Authentication, authorization, a bounded real first page, distinct forward pagination, normalized string IDs, canonical mapping, exact-source reconciliation, name-conflict blocking, provider import, mixed WTE addition, reload, prescription, reorder, superset persistence, gateway-only browser traffic, application secret non-exposure, and cleanup are proven. Revoke the credential exposed outside the application and install a replacement server-only key before deployment.

## 18. Provider exercise video preview

The current provider's list response is intentionally lightweight in the live
account: it contains `imageUrl` but not `videoUrl`. The documented and live
`GET /api/v1/exercises/{exerciseId}` response returned HTTP 200 with a matching
string exercise ID plus both `imageUrl` and `videoUrl`. The gateway now supports
that exact fixed detail route through the existing RepSync authentication and
PT authorization boundary. Unknown fields, mixed search/detail bodies,
malformed IDs, oversized responses, and invalid detail shapes are rejected.

Headed verification loaded 24 Provider Catalog rows with lazy, fixed-size
starting-position thumbnails. Opening the first row's **Preview** issued one
`exercise_dataset_detail` gateway request, which succeeded in 243 ms. The
dialog rendered the real exercise title, overview, instructions, poster, and
MP4 controls. Before playback the video was paused with `preload="none"`,
`readyState = 0`, and a poster present. A bounded media request returned HTTP
206 with `video/mp4`, proving the referenced media is playable without loading
the entire asset during the gate.

Provider API traffic remained server-side. The browser received only the
normalized detail payload through Supabase and loaded credential-free media
from `cdn.exercisedb.dev`. The production build contained zero matches for the
configured provider secret value, `supabase/.env.local` remained ignored, and
the structured function log contained no credential or authorization value.
Saving an unsaved provider exercise—either directly from Exercise Library or
through the workout picker—now resolves and caches this same detail record
before import, so `video_url` is persisted instead of importing the lightweight
list record without media. Focused provider gateway, normalization,
exercise-browser, library/picker contract, and WTE mutation coverage passed,
and the production build passed.

## 19. PR-EXLIB-07D final consolidation and release-readiness gate

Verification date: 2026-09-02. Branch: `EXERCISELIBRARY`. Audited HEAD:
`bd0575d7418dc26e3eecaf8d2a0804d605f12acc`. This section supersedes earlier
intermediate verdicts where the current working tree differs from the commits
audited by those sections. No remote Supabase operation was run.

### Tracked-file and clean-checkout status

- The patch contains 20 modified tracked files and three required untracked
  files: `src/components/pt/provider-anatomy-filter-fields.tsx`,
  `src/lib/exercise-provider-anatomy.ts`, and
  `tests/unit/exercise-provider-anatomy.test.ts`.
- There are no untracked migration files. The release-evidence document,
  provider/gateway documentation, canonical taxonomy, selector/artwork,
  provenance, license, gateway entry point, existing migrations, and database
  tests are tracked.
- `.env.local`, `.env.e2e.local`, and `supabase/.env.local` are ignored runtime
  files. No environment value was copied into this document.
- A detached tracked-only worktree at audited HEAD had the tracked diff applied,
  installed 444 packages, and failed its build because the three required
  untracked files were absent. The failure was the expected unresolved imports
  for the provider anatomy coordinator and filter fields. Therefore the current
  patch does not pass the clean-checkout gate until those files are added to
  Git.

### Migration and configuration status

- No migration was added or changed by PR-EXLIB-07D. Local migration status
  includes both `20260830120000_exercise_canonical_muscle_taxonomy.sql` and
  `20260901160000_workout_template_exercise_persistence_repair.sql` as applied.
- Presence-only inspection confirms all required server-only names in the
  ignored local function environment: `EXERCISE_DATASET_BASE_URL`,
  `EXERCISE_DATASET_API_KEY`, `EXERCISE_DATASET_API_KEY_HEADER`, and
  `EXERCISE_DATASET_API_HOST`.
- Staging/production migration and secret state were not inspected or changed.

### Provider mapping coverage

- Body-part corpus: 18 options, 18 mapping entries, 18 distinct provider
  values, zero missing entries, and zero extra entries. Dispositions are 5
  `exact`, 9 `region_only`, and 4 `unsupported`.
- Target-muscle corpus: 46 options, 46 mapping entries, 46 distinct provider
  values, zero missing entries, and zero extra entries. Dispositions are 13
  `exact`, 20 `grouped`, 10 `region_only`, and 3 `unsupported`.
- Every non-null canonical body-region and muscle key is validated against the
  locked taxonomy. Unknown runtime values return `unmapped` and retain the
  source label instead of being guessed.
- Pectoral heads group to `pectorals`; wrist flexors/extensors group to
  `forearms`; quadriceps and hamstrings use their existing canonical groups;
  gastrocnemius/soleus group to `calves`; gluteal, adductor, trapezius, and arm
  subdivisions use their reviewed broader canonical muscles. Raw quadriceps
  subdivision aliases remain supported by the existing mapper.
- Rotator-cuff values remain shoulder-region-only rather than deltoids;
  serratus remains core-region-only rather than obliques. Fibularis/peroneal
  names and out-of-corpus hamstring subdivisions remain unmapped rather than
  being forced into calves or another canonical muscle.
- `NECK`, `HANDS`, `FEET`, and `FACE` body parts are explicitly unsupported.
  `SPLENIUS` and `STERNOCLEIDOMASTOID` are also explicitly unsupported because
  the locked artwork has no neck-muscle region.

### Synchronization parity

- The dedicated library and workout picker both use
  `ProviderAnatomyFilterFields` and the same coordinator functions:
  `selectProviderTargetMuscle`, `selectProviderBodyPart`, and
  `selectCanonicalMuscle`.
- Exact and grouped provider targets produce only reviewed canonical muscle
  selections. Region-only and unsupported targets produce no fabricated
  visual highlight and expose explanatory copy. A manually selected provider
  body part never chooses an arbitrary muscle.
- Visualizer selections derive only conservative provider filters. One-to-many
  reverse mappings use a safe broad body part or no provider target rather than
  selecting an arbitrary subtype. Clear behavior preserves independent manual
  values and removes derived values.
- Custom/saved exercises use the derived canonical muscle in local filtering;
  provider requests continue to send the raw provider body-part and target
  values.
- Both call sites pass only `value` and `onValueChange` to
  `AnatomicalMuscleSelector`. Provider labels and SVG identifiers do not enter
  the selector API.

### Real-provider, authorization, and pagination verdict

The PR-EXLIB-07C-A evidence in section 17 is accepted as real-provider evidence,
not stub evidence. It records 401 for a missing token, 401 for an invalid token,
403 for a client-only identity, and HTTP 200 for both a PT owner and an
authorized PT coach. The owner received one bounded page of 24 real normalized
records with string IDs. One explicit forward-cursor request returned a second
bounded page and advanced the rendered catalog from 24 to 48 distinct records.
No automatic cursor crawl occurred.

The same evidence records zero provider requests while My Library was open,
one bounded search request when Provider Catalog opened, at most one search
request for one Load more action, no direct browser-to-provider API request,
and no provider credential or bearer token in frontend assets, browser traffic,
or structured function logs. This consolidation did not rerun or substitute a
stub for that real-provider proof.

### Reconciliation, import, mixed add, and WTE persistence

- Exact provider/source identity reuses the internal exercise UUID. A name-only
  collision remains `name_conflict` and is not silently merged. A new real
  provider item imports to `public.exercises` with string source ID, source
  payload, and canonical muscle arrays.
- Picker selection state remains independent of query, filters, source tabs,
  and visible pages. No WTE is written before **Add selected**. Already-added
  checks and in-flight submit protection remain in place.
- The recorded real-provider mixed saved/custom/provider add resolved every
  selection to `public.exercises.id`, inserted three WTE rows, and survived a
  fresh authenticated read.
- The initial insert builder still emits exactly
  `{ workout_template_id, exercise_id, sort_order }`. It does not write provider
  IDs or prescription fields during the initial insert.
- Focused mutation tests and the prior runtime proof cover sets, reps, rest,
  tempo, RPE, notes, sort order, supersets, returned-ID checking, rollback after
  optimistic failure, and persistence after reload. Repeated selections are
  partitioned against current WTE exercise IDs before insert.

### Current network and secret inspection

- The current production build contains zero occurrences of the configured
  provider API key and zero occurrences of the four server-only configuration
  names. Frontend source/public/build files contain zero occurrences of the
  configured provider base URL or host.
- Frontend Exercise Library and picker code call the local dataset client only;
  no direct provider `fetch` or Axios call is present. Provider API access
  remains behind the Supabase Edge Function.
- Runtime log secrecy remains supported by the structured safe-log contract and
  the PR-EXLIB-07C-A inspection recorded in section 17. No environment value is
  included here.

### Test, database, and CI result

- Focused exercise/provider/WTE suite: 14 files, 171 tests, all passed.
- Local database tests: 2 files, 40 pgTAP assertions, all passed. Local database
  lint returned zero errors.
- Production build passed and transformed 3,408 modules. ESLint, Prettier, and
  `git diff --check` passed.
- Full unit suite: 221 files passed and one file failed; 1,214 tests passed and
  one test failed. The unchanged failure is
  `auth-component-animated-signin-contract.test.ts` expecting a stale embedded
  CSS string. Neither that test nor the auth component is modified by this
  patch.
- Required `npm run verify:release`: nonzero. Lint, formatting, and build passed;
  Playwright completed 34 passed, 2 skipped, and 2 failed. The unchanged failures
  are the auth-guard expectation for a visible Sign in button and the product
  page expectation for ten deep-dive chapter links. Their tests and relevant
  source files are unchanged by this patch. CI is not green.
- The detached tracked-only build also exits nonzero because required source is
  untracked.

### Accepted limitations, rollback, and final verdict

Existing accepted architectural limitations remain: provider import and WTE
insert are not atomic, duplicate prevention is application-level, and multi-row
WTE persistence relies on exact returned-ID checking plus authoritative
refetch/recovery. Credential rotation remains required before any staging or
production deployment because the prior credential was exposed outside the
application.

Rollback requires reverting the Exercise Library/picker/provider coordinator,
gateway, mapping, tests, documentation, and evidence patch together. No new
migration or remote state was introduced by this consolidation. The existing
forward WTE persistence repair should not be rolled back independently while
its repaired update semantics are required.

**Final PR-EXLIB-07D verdict: Blocked.** Real-provider behavior, mapping
coverage, synchronization, reconciliation/import, mixed add, WTE identity, and
persistence are proven. Release readiness is blocked because three required
files are untracked, the tracked-only clean checkout cannot build, the full unit
suite exits nonzero, and the required release command exits nonzero. Provider
choice, canonical taxonomy, anatomical artwork, exercise identity, the initial
WTE insert contract, programs, assignments, runner behavior, set logging,
history, and client-personal exercises were unchanged by this gate.
