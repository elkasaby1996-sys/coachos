# Client portal experience review

Reviewed September 8, 2026, against commit `cb1f26f`, using the local app and local Supabase. Phone and desktop received equal review weight. This is a product-experience review, not a production release or accessibility certification. No application code, API, or database schema was changed.

## Recommendation

Fix interrupted-work recovery, the workout entry layout and exercise instructions, and the interpretation of recorded measurements before adding more features. The basic coaching loop works, but some transitions and notifications obscure the result. Settings and empty states need a smaller follow-up pass.

Priorities below describe product impact: **P1** affects completion, accessibility, saved work, or the accuracy of what clients see; **P2** affects clarity, convenience, or discovery. All findings in the backlog have browser or source evidence. Items requiring further verification are listed separately.

## Coverage and evidence

| Review area                | Execution                                                                                                                                                                                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main portal                | Home, Workouts, Nutrition, Habits, Check-ins, Messages, Progress, Wearables, Settings, and coaching onboarding at 375, 768, 1024, and 1440 px: [40 captures](viewport-evidence.json).                                                                                                           |
| Detail states              | Nutrition entry, mixed-unit progress, billing, notification settings, and personal/assigned/rest workout cards at all four widths: [20 captures](detail-evidence.json).                                                                                                                         |
| New client                 | Completed account setup through the UI, then captured eight empty portal screens at all four widths: [32 captures](new-client-evidence.json).                                                                                                                                                   |
| Mobile browser             | WebKit with mobile/touch emulation at 375 px: Home, Check-ins, Settings, Messages, and workout logging. [Evidence](webkit-evidence.json).                                                                                                                                                       |
| Interrupted work           | Navigation, refresh, a failed workout save, a failed message send, and a failed check-in submission followed by retry. [Draft tests](continuity-evidence.json), [message failure](message-failure-evidence.json), [check-in retry](checkin-submit-evidence.json).                               |
| Coaching loop              | Assigned workout → start → save → finish → summary; check-in → coach review through the UI → notification → exact client feedback. [Completion](completion-and-null-evidence.json), [coach review](coach-feedback-evidence.json), [notification clicks](notification-navigation-evidence.json). |
| Keyboard and focused forms | Profile field traversal, keyboard activation of a check-in score, DOM label checks, and a focused composer in a reduced-height WebKit viewport. [Profile](home-and-keyboard-evidence.json), [score selection](keyboard-score-evidence.json).                                                    |
| Existing regression checks | Eight targeted unit files: **68 passed, zero failed, zero skipped**. These tests do not cover all reproduced defects. [Results](unit-test-results.json).                                                                                                                                        |

The width sweep found no document-level horizontal overflow. This did **not** establish that all content was visible: the workout table clips fields inside its own container. Screenshots accompany the JSON evidence in this directory.

### Test-data boundaries

All submissions, edits, message attempts, and coach reviews used a separate local workspace, **Portal Experience Review**, and accounts ending in `.review0908@repsync.test`. Existing demo/client records were preserved. Fixtures use UUID prefix `a9082026-a001-4000-8000-` where fixed IDs were needed. The local fixtures remain available for follow-up; authentication-state files and temporary scripts are not part of this report.

The initial fixture was adapted from the repository demo seed. It includes legacy completed onboarding with incomplete answers, a submitted future-dated check-in, and duplicate assigned exercise snapshots created by the seed plus materialization. Those inconsistencies are **not** counted as ordinary product defects. Additional rest days, a personal workout, a nutrition day, and mixed-unit habit entries were added only to the isolated fixture. Upload tests used synthetic one-pixel images.

## Prioritized backlog

### F01 · P1 · Preserve unfinished entries

**Evidence:** Typing an unsaved workout weight, check-in answer, or message and navigating away lost the value without a warning. Refresh also lost check-in and message drafts. After a simulated failed workout save, `112` remained on screen but disappeared on refresh. Explicitly saved `100` kg / `5` reps survived refresh. [Reproduction results](continuity-evidence.json).

**Change:** Add recoverable drafts scoped to the signed-in account and the specific workout/session, check-in, or conversation. Show distinct saving, saved, and unsaved/error states. Clear drafts only after a confirmed save/submission or explicit discard. Protect photo selections from silent loss; do not treat an expired blob URL as a recovered upload. Warn before leaving when a draft cannot be persisted.

**Acceptance:** Each text/numeric draft survives navigation and refresh; a failed save remains retryable without re-entry; restored drafts never appear in another account or record. Submitted/reviewed check-ins cannot be overwritten by old drafts. Photo recovery or the need to reselect a photo is explicit.

### F02 · P1 · Make workout logging fit the available width

**Evidence:** At 375 px, the reps field extends beyond the card and RPE is clipped; the Done column is also beyond the visible table. The page itself does not overflow. The fixed column widths and `overflow-hidden` wrapper in `ActiveExercisePanel.tsx` explain the result. [Screenshot](workout-active-375.png), [measured field bounds](continuity-evidence.json).

**Change:** Use a stacked set layout on narrow screens, with labeled Weight, Reps, RPE, and Done controls. Keep a table only when all columns fit. Keep previous performance and the save action visible without horizontal panning.

**Acceptance:** Every field and action is visible and operable at all four widths, with 44 px touch targets and at least 16 px entry text on phones. Keyboard focus must not move into clipped content. Test single exercises and supersets.

### F03 · P1 · Show the coach's exercise targets beside logging

**Evidence:** The fixture prescribes five reps, RPE 8, tempo, and rest for the deadlift. The active panel shows coach notes and blank actual-value inputs but no target reps/RPE/tempo. Its Previous column uses prior session logs, so it does not supply the missing prescription. The panel constructs an unused `previousLabel`; that is not a substitute for showing targets. [Before-entry screenshot](workout-run-before-375.png); sources: `workout-run.tsx` and `components/client/workout-session/ActiveExercisePanel.tsx`.

**Change:** Add a compact target row for set count, prescribed reps/range or duration, effort, tempo, and rest when supplied. Separate targets, previous performance, and the client's actual entries. Keep actual entries blank until the client records them.

**Acceptance:** A new client with no previous logs can tell what to perform. Numeric reps, rep ranges, and timed intervals remain intact; absent targets are omitted rather than presented as zero. Targets remain visible on phone and desktop.

### F04 · P1 · Convert weight entries before charting them

**Evidence:** Adding a 150 lb entry alongside existing kg entries changed the display unit to lb without converting subsequent kg values. The latest 67.9 kg entry displayed as **67.9 lb**, and the summary reported **−82.9 lb**. `progress.tsx` selects a unit from the logs and charts each later `weight_value` unchanged. [Controlled data result](detail-evidence.json), [screenshot](detail-progress-1440.png).

**Change:** Normalize each entry using its recorded unit, then convert the normalized values to the selected display unit before calculating chart points and changes. Use the account preference for presentation, not the first row's unit. Preserve missing values.

**Acceptance:** Mixed kg/lb entries produce the same physical trend as equivalent single-unit entries. Switching display units changes the numbers and labels consistently, without changing the underlying trend. Baseline and habit values use the same conversion path.

### F05 · P1 · Separate planned nutrition from recorded intake

**Evidence:** An unlogged meal showed `0/1 meals (0%)`, yet both Planned and Actual totals showed 600 calories and the same macros. Clearing Actual calories and saving produced a persisted/displayed **0** after refresh. `nutrition-day.tsx` falls back to targets for actual totals and parses an empty string with `Number("")`. [Unlogged state](detail-nutrition-1440.png), [blank-value test](completion-and-null-evidence.json).

**Change:** Sum actual intake from saved log values only. Show “Not logged” when no actual value exists; retain a deliberately entered zero. Label fields with units and add an explicit “Use planned amounts” action if prefill is wanted. Apply the same planned/actual distinction to Home's nutrition summary.

**Acceptance:** An untouched 600-calorie plan has a target of 600 and no recorded actual intake. A blank entry saves as missing, an explicit zero remains zero, and a partial log neither adopts the missing targets nor implies that all meals were completed.

### F06 · P1 · Keep the submitted check-in in view

**Evidence:** After submitting Aug 22 successfully, the page automatically selected Aug 29 but retained the Review step. It showed “No response submitted” and “Required photo missing from submission” beside the success notification. The Aug 22 record was correctly saved. [Before/after text](checkin-submit-evidence.json), [screenshot](checkin-submitted-1440.png).

**Change:** Select and retain the newly submitted record, display its read-only summary, and show its date and submission state. Offer a separate action to open another check-in. If the user selects a different open check-in, reset that form to Questions.

**Acceptance:** Submission and retry end on the submitted record with its saved answers/photos. Another overdue record cannot appear as the submission result. Refresh and notification entry select the same record.

### F07 · P1 · Open the exact notification target

**Evidence:** A generated rest-day assignment notification opened `/app/home`. A request for Sep 12 opened `/app/checkin`, which selected a different overdue date. The reviewed-check-in notification correctly opened `/app/checkins?checkin=<id>` and displayed feedback. The resolver currently accepts a generic valid `action_url` before considering the entity. [Actual notification clicks](notification-navigation-evidence.json); source: `features/notifications/lib/notification-route-resolver.ts`.

**Change:** Generate record-specific URLs for workouts, check-in requests, and conversations. Resolve existing generic notifications using their entity when possible. Rest-day notifications should open the day's notes and use a rest-day action label; they should not invite the client to start a workout. Preserve audience and access validation.

**Acceptance:** With multiple workouts, overdue check-ins, and conversations, each notification opens its own target. Missing or inaccessible targets show an explanation and a relevant list. Reviewed-check-in links continue working.

### F08 · P1 · Surface submitted check-ins in the coach review list

**Evidence:** The coach's first page contained 12 future check-ins and showed “Needs review 0” while two submitted records existed. The query creates 120 days of future cycles, sorts due dates descending, and paginates before presenting the list. A direct check-in link opened the submitted record and allowed review. [Screenshot](coach-checkin-list.png); source: `pages/pt/client-detail.tsx`, `checkinsQuery`.

**Change:** Default the review list to submitted/unreviewed records. Provide separate upcoming/history views. Calculate status counts across the eligible records rather than only the loaded page; keep exact-record links independent of pagination.

**Acceptance:** A new submission appears immediately in the coach's review queue regardless of future schedule length. Counts agree with the underlying records and remain stable when more pages load. Completing review removes it from the unreviewed queue and produces client feedback.

### F09 · P1 · Give entry controls usable labels and selection states

**Evidence:** Workout numeric controls had no associated label or `aria-label`; nutrition actual fields had only placeholders, which disappear when prefilled. Profile Full name had no associated label. A check-in score could be activated with Space, but its selected state was represented only by CSS, with no `aria-pressed`, checked state, or radio semantics. [Field inspection](detail-evidence.json), [workout inspection](continuity-evidence.json), [keyboard score](keyboard-score-evidence.json).

**Change:** Associate visible labels with inputs, including exercise/set identity and units. Use a labeled radio group for a single-choice score and expose its selected value. Give nutrition numeric fields appropriate decimal/numeric keyboards. Verify visible focus rather than relying only on successful Tab movement.

**Acceptance:** Screen-reader names identify each field and set; selected scores are announced and keyboard-operable; prefilled nutrition fields retain visible labels; focus order follows the visual order without hidden stops. Test manually with a screen reader before closing this item.

### F10 · P2 · Match Home's next action to the client's state

**Evidence:** Home showed “Start workout” for a session that Workouts correctly called “Resume workout.” It had no visible overdue-check-in or new-feedback action despite those records being present. A new uncoached account still saw “Message coach,” coach-assignment wording, and repeated empty calendar information. [Main states](viewport-evidence.json), [new-client states](new-client-evidence.json), [rest-day state](home-and-keyboard-evidence.json).

**Change:** Add a compact next-action area: resume an active session first, then a due check-in, then today's planned workout; show unread feedback as a separate record-specific action. Preserve the rest-day note and habit action. For uncoached clients, offer personal planning and finding/joining a coach, and omit Message coach until a conversation is available. Consolidate repeated empty states.

**Acceptance:** Each tested state has an appropriate primary action. Overdue check-ins and feedback can be reached directly from Home; rest days have no start action; a new uncoached account is not told to contact a nonexistent coach.

### F11 · P2 · Replace technical profile inputs

**Evidence:** Settings and initial account setup expose an Avatar URL input; Settings also requires a free-text timezone such as `Asia/Qatar`. [Settings screenshot](settings-tab-profile-375.png), [initial setup](new-client-onboarding-375.png); source: `pages/client/settings.tsx`.

**Change:** Specify a photo picker/upload flow with preview, replace, and remove actions. Preserve existing avatars on failure. Use a searchable timezone selector displaying friendly city/region names with valid stored timezone identifiers and an explicit device-timezone suggestion. Reuse the controls in account setup.

**Acceptance:** Clients can choose a phone photo without supplying a URL, recover from invalid/failed uploads, and select a valid timezone without knowing its identifier. Existing URL-backed avatars still render. Storage access and upload limits must be specified in the implementation task before changes are made.

### F12 · P2 · Remove artificial invoice history

**Evidence:** Billing is “Not connected,” yet the page displays an invoice-like row marked Pending. It comes from a hardcoded `placeholder-invoice`, not an invoice record. [Screenshot](detail-settings-tab-billing-1440.png); source: `settings.tsx`, `invoices`.

**Change:** Remove the synthetic row and show one compact “Billing is not connected” state. Keep any genuinely available coaching-service details separate from payment status. Do not add a payment integration as part of this correction.

**Acceptance:** Zero invoice records produces zero invoice rows. A pending label appears only for a real record in that state, and disconnected billing does not imply that an invoice is being processed.

### F13 · P2 · Make notification settings reflect device support

**Evidence:** Clients can enable Push, but the inspected frontend has no caller for `registerPushSubscription` and no service-worker/push-permission enrollment flow. The subscription helper and preference fields exist; this is not proof of working delivery. [Settings evidence](detail-evidence.json); source: `features/notifications/lib/notification-service.ts`.

**Change:** Mark Push unavailable until an actual supported enrollment path exists. If added later, distinguish app preference, browser permission, device subscription, and delivery status. Keep email and in-app controls tied to their implemented behavior.

**Acceptance:** A toggle alone cannot imply that a device is registered. Unsupported and permission-denied states have clear explanations. Live email/push delivery requires separate provider verification; it was not tested here.

### F14 · P1 · Keep the message composer reachable in short viewports

**Evidence:** In mobile WebKit at 375 × 480, focusing and scrolling the composer into view left its center covered; the fixed bottom navigation occupied the visible lower area. The thread also has a minimum height of 26rem. [Screenshot](webkit-message-reduced-height.png), [geometry check](webkit-evidence.json); source: `styles/client-portal.css`.

**Change:** Size the thread to the available visual viewport and reserve space for navigation and safe areas. Ensure the composer and Send action remain reachable when space shrinks; adjust bottom navigation while typing if needed.

**Acceptance:** At 375 × 480 and normal phone heights, a focused composer and Send button remain visible and tappable. Verify with real iOS and Android keyboards before closure. The reproduced reduced-height defect is confirmed; physical-keyboard behavior is still unverified.

### F15 · P2 · Explain what progress actually includes

**Evidence:** One saved set in an unfinished session produced “500 volume” and a zero-change exercise comparison. The page's text says summaries use completed sets, but the query does not filter completed sets/sessions. Missing volume inputs initialize a date aggregate at zero. [Detail evidence](detail-evidence.json); source: `progress.tsx`, `setLogsQuery` and `exerciseTrends`.

**Change:** Define workout progress as completed sets from finished sessions, normalize weight units before volume aggregation, and label volume in kg·reps or lb·reps. Require observations from two separate sessions before showing change. Preserve missing volume as missing; explain when more data is needed.

**Acceptance:** An unfinished session does not change completed-workout trends. A single observation has no change claim. Missing weight/reps do not become zero volume, explicit zeros remain valid where applicable, and chart/tooltips/summary use the same date range and calculation.

### F16 · P2 · Distinguish unknown plan ownership from Personal

**Evidence:** A nutrition day attached to a coach-owned template displayed “Personal.” Home displayed “Your coach has not assigned a nutrition plan yet” while showing that day's meal macros. The day UI derives ownership from the embedded template relation; a missing relation falls back to Personal. The hidden relation's precise cause has not been established. [Nutrition screenshot](detail-nutrition-1440.png), [Home text](home-and-keyboard-evidence.json).

**Change:** Resolve assignment existence separately from optional template metadata. Use the assignment's authoritative ownership information; if it cannot be read, show a neutral source state rather than Personal or No plan. Investigate the client-visible relation before choosing a query or permission change.

**Acceptance:** A coach-assigned nutrition day is identified consistently on Home and Nutrition even when template metadata is missing. Personal plans remain correctly labeled. Tests must cover inaccessible/removed template metadata without broadening client access to the coach's library.

## What worked

- Saved workout sets survived refresh; finishing a session opened its summary through Home.
- Rest-day cards showed coach notes without Start, Edit, or Delete actions. Personal workout cards retained management actions, and assigned workouts showed Coach.
- A failed check-in submission retained its responses/photos for retry; the retry saved successfully. A failed message send retained its text while the page stayed open.
- The coach could open the exact submitted check-in, save feedback, complete review, and generate a working client feedback link. The queue-discovery defect is separate from review persistence.
- New-account setup completed through the UI once its profile had loaded. Empty portal routes were reachable. Habits distinguishes untouched forms from saved entries; Wearables uses `--` for missing health scores.
- Targeted state, stale-form, routing, and page-contract tests passed. These are useful safeguards, but passing them did not detect the draft-loss, clipping, or calculation defects above.

## Remaining verification

- **Physical devices:** WebKit mobile emulation is not an iPhone. Real keyboard resizing, camera/photo orientation, large photos, safe areas, and Android behavior still need device testing. The upload loop here used synthetic small PNGs.
- **Slow hydration:** One fast initial-onboarding attempt lost the entered date before submission while the profile was loading. Waiting for profile hydration allowed completion. Reproduce under controlled latency before deciding whether loading controls or form hydration should change.
- **Legacy onboarding:** The seeded completed onboarding showed 29% complete and missing answers. Validate the intended handling of migrated/completed records with real representative data before treating this fixture inconsistency as a general defect.
- **Runtime errors:** The initial route sweep captured one opaque `Object` page error. A separate [instrumented follow-up](runtime-followup.json) did not reproduce it and recorded no unhandled rejections. Its original cause remains unresolved; do not treat this review as evidence of zero runtime errors.
- **Interrupted multi-request writes:** Workout finish and check-in submission contain multiple database/storage operations. This pass injected an early check-in failure and a set-save failure. Mid-upload interruption, partial finish failure, simultaneous tabs, and idempotent retries need dedicated integration tests before any persistence redesign.
- **External services:** No live wearable sync, email delivery, push delivery, payment transaction, production environment, or remote migration was tested or changed.

## Suggested implementation order

1. Fix F02/F03/F09 together for usable workout entry; fix F04/F05 for trustworthy numbers.
2. Add F01 recovery and F06 submission continuity, with record-scoped integration tests.
3. Complete F07/F08/F14 so coaching communication is easy to reach on either device.
4. Apply F10–F13 and F15–F16, closing the explicitly noted data/provider questions before implementation.

Retain the current light portal style, useful descriptions, and the user's plain-language guidance. Do not reintroduce decorative page headings, title punctuation, or metric icons. No production readiness claim should be inferred from completing this review.
