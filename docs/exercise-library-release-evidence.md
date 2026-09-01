# Exercise Library runtime and release evidence

## 1. Scope and commit/branch

- Gate: PR-EXLIB-07A — Exercise Library Runtime and Release Gate.
- Branch: `EXERCISELIBRARY`.
- Verified commit: `7aae5dc9f3ae639980e14583de2263f0528a647f` (`7aae5dc`).
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

Local Supabase was rebuilt from migrations. The latest applied migration matched the repository tail: `20260830120000_exercise_canonical_muscle_taxonomy.sql`. `npm run supabase:db:lint` completed with zero error-level findings. PR-EXLIB-07A added no migration.

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

## 10. Builder prescription/DnD/superset regression

**Failed.** On the QA template, dragging one exercise onto another produced the expected immediate grouped UI, reordered the two rows, displayed the superset label, and emitted a drag/drop status announcement. The database rows did not receive the new `sort_order`, `superset_group`, or `rest_seconds`, and reload restored the original ungrouped order.

A headed edit of sets, reps, rest, tempo, RPE, and notes also closed normally but left all corresponding database columns null and reloaded as blank. Preview/persisted grouped rendering could not be accepted because the prerequisite updates did not persist. No builder fix was made because this gate was scoped to evidence and smallest verified fixes, and the failure needs isolated diagnosis before changing locked builder behavior.

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
- Builder prescription, ordering, and superset updates failed to persist in headed local verification.
- One committed Exercise Library page contract is stale against the current selector wrapper indentation and fails despite the controlled API remaining present.

## 14. Rollback sequence

1. Stop the local `exercise-dataset-search` serve process and remove any disposable ignored stub/env files.
2. Remove deterministic QA templates, WTE rows, exercises, workspace memberships, workspace, and auth identities.
3. For a deployed PR, revert the PR merge commit using the repository’s normal `git revert` workflow and rebuild/redeploy the previous frontend and Edge Function revisions.
4. Remove the PR’s Edge Function configuration only if it was introduced specifically for the reverted release; do not expose values while doing so.
5. No database rollback is required for PR-EXLIB-07A because it adds no migration or schema change.

## 15. Release recommendation

**Blocked.** Acceptance requires a successful real-provider request, and no valid local provider configuration was available. Release is independently blocked by the reproducible builder update-persistence failure and the failing committed Exercise Library page contract. Provider choice, canonical taxonomy, anatomical artwork, database schema, prescription model, programs, assignment RPCs, runner behavior, set logging/history, and client-personal exercise behavior were not changed during this gate.
