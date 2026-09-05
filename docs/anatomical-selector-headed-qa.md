# Anatomical selector headed QA

## Supplied artwork replacement — 2026-09-05

The user supplied separate front and back PNGs and requested replacing the
current illustration. This supersedes the vector-only presentation described
in the earlier PR-EXLIB-UI-01 record below.

- Copied both original 1024 × 1536 images unchanged to
  `public/assets/anatomy/male-front.png` and `male-back.png`. SHA-256 hashes
  match the supplied files. Front is 1,679,415 bytes; back is 1,666,933 bytes.
- Replaced the rendered vector body with the active image. New bilateral
  outlines use the images' native coordinates, shared by visible highlights
  and hit areas. The former vector geometry is retained as historical source
  with its original license, but is no longer imported by the renderer.
- Translucent teal highlights preserve the original image texture. Hover,
  gold keyboard focus, controlled single selection, list access, disabled
  controls, and existing filtering behavior remain. Deep muscle targets use
  a surface projection; the selector is not a layered anatomical atlas.
- No dependencies were added. Only the active surface is rendered; inline
  and expanded instances reference the same static URL.

Validation: 43 selector/library unit tests and 14 provider/domain tests passed;
all 7 anatomy browser tests passed. These cover pointer activation on both
sides of every region, keyboard and disabled behavior, image decoding,
selection synchronization, provider request counts, nested picker behavior,
and framing/overflow at 1440, 768, and 375 px. Production build, focused ESLint,
Prettier, and `git diff --check` passed. The live authenticated library was
also inspected with the front, back, and selected chest artwork.

Screenshots: `tmp/exercise-catalog/anatomy-supplied-assets/screenshots/after/`.
The earlier vector screenshots remain in their original directory. The full
release gate was not rerun for this asset change; its prior authentication
smoke failures are recorded below.

## PR-EXLIB-UI-01 — 2026-09-05

Baseline: `a3b73b4` on `codex/fix-pt-hub-header-overlap`. This pass updates
the existing selector and its library wrapper; exercise filtering, taxonomy,
provider coordination, identity, imports, prescriptions, and persistence are
unchanged. No dependencies or raster assets were added. The vendored MIT
notice, provenance, adapter, overlays, coordinates, and shared art/hit
transform are unchanged.

### Presentation and materials

- The compact selector has a heading with Clear and an accessible Expand anatomy
  icon button, Body map / Muscle list tabs, Front / Back controls, one figure,
  and one selected-muscle/context row. The library no longer hides the list tab
  or adds a duplicate desktop selection heading. Mobile disclosures remain.
- The atlas uses the existing Radix Dialog. At a container width of 960px it
  presents searchable taxonomy navigation, one active body, and selection
  context. Smaller containers use a single column and the equivalent list tab.
  Mobile/tablet selection context stays compact. There is no Apply or draft
  selection; the parent's `value` remains authoritative.
- Directional mirrored gradients give torso, limbs, and passive anatomy distinct
  materials. Repeated copies of the exact artwork paths confine fiber detail
  and specular shading to each muscle. Selected teal muscles retain the same
  shading. Outline seams and a restrained canvas spotlight improve separation.
  No per-path blur, canvas, continuous animation, or added geometry is used.
- Every SVG material ID and list group/search ID is scoped with React `useId`.
  The portalled atlas declares its own dark palette without setting a global
  `.dark` class. Hover/focus previews are explicitly labeled; gold focus outlines
  differ from teal selection, and selection changes have polite announcements.

### Runtime and visual QA

The actual authenticated library and workout picker were inspected before and
after in the in-app browser, including mobile 375px, tablet 768px, and desktop
1440px atlas layouts. The full head, hands, and feet remain within the canvas;
the mobile library support launcher stays hidden while its filter is open.
Closing the atlas leaves the workout picker open and restores focus to Expand.
Temporary review tabs were closed and the viewport override was reset.

`tests/e2e/anatomical-selector.spec.ts` mounts the actual library toolbar,
filter, results, provider coordinator, and ExercisePicker with disposable UUID
records. A Playwright-intercepted HTML document imports the fixture; no QA
route, entry point, or import was added to the production app. The fixture
contains inherited offscreen native selects within its shell, matching app
containment. Tests independently check the selector and portal for overflow.
Provider dropdown synchronization is exercised through keyboard activation;
the existing long provider dropdown extends outside the isolated viewport for
pointer activation and was not changed by this selector patch.

The seven browser tests cover:

- All 24 surface regions with Enter and Space, and actual pointer hit points on
  both sides of paired regions. Callbacks always contain the mapped muscle key.
- All 21 muscles in searchable list navigation, parent-controlled rerendering,
  Clear → null, disabled callback guards, and selection on the opposite surface.
- Inline/atlas synchronization, unique simultaneous SVG definitions, local
  palette inheritance, Escape, and focus restoration.
- Provider dropdown/map synchronization and exercise-search isolation; opening,
  hovering, searching navigation, and changing surface cause no new provider or
  Supabase requests in this library fixture.
- In the active Provider Catalog, a mocked gateway receives one initial request,
  none from atlas exploration/dismissal, and exactly one further request when
  Anterior deltoids is committed, with the existing `ANTERIOR DELTOID` target.
- Two selected exercises and their exact internal selection keys survive a
  nested atlas selection and dismissal at 1440, 768, and 375px.
- Selector/atlas overflow checks and full artwork bounds inside the canvas.
  Browser console errors and React warnings are checked in the atlas lifecycle
  test. WTE insertion/identity contracts remain covered by the unit suite.

Screenshot artifacts (900px viewport height, full element/page captures):

```text
tmp/exercise-catalog/pr-exlib-ui-01/screenshots/before/{1440,768,375}/
tmp/exercise-catalog/pr-exlib-ui-01/screenshots/after/{1440,768,375}/
```

Each width includes neutral front/back, pectorals, posterior deltoids, lats,
hip abductors, quadriceps, keyboard focus, muscle list, library integration,
and workout picker. After captures also include `expanded.png` and
`picker-expanded.png`; expansion did not exist in the baseline. Baseline list
captures use the picker because the library previously hid its list tab.
These saved integration captures use the disposable data fixture; the live
app-shell inspections are recorded in the task's browser screenshots.

Final neutral selector heights, excluding the parent disclosure/card: desktop
1440px **559 → 559px**, tablet 768px **673 → 559px**, mobile 375px
**510 → 559px**. The extra mobile controls add 49px; results remain directly
below the disclosure. Full artwork bounds are asserted inside the canvas.

### Validation and bundle measurements

- Required `ui-ux-pro-max --design-system` lookup completed before implementation.
- Focused selector/provider/browser/picker/taxonomy/classification/WTE unit run:
  **118 passed**. Full unit run: **1,228 passed in 223 files**.
- `npx tsc -b` passed. Final
  `npx playwright test tests/e2e/anatomical-selector.spec.ts`: **7 passed in
  1.5 minutes**, including the active-provider request test. Its full log is
  `tmp/exercise-catalog/pr-exlib-ui-01/anatomy-final.log`.
- Final `npm run lint`, `npm run format`, and `git diff --check` passed. The
  release run initially reported a fixture Fast Refresh lint warning; exporting
  the fixture component resolved it, and final lint is clean.
- `npm run verify:release` passed lint, formatting, and the production build,
  but **failed its E2E phase: 38 passed, 4 failed, 2 skipped**. All six anatomy
  tests present at that point passed, including the final framing checks.
  Playwright configuration, fresh-server policy, workers, and retries were not
  changed. The later active-provider test also passed separately.
- A fresh-server follow-up of the failed authentication cases plus the three
  visual anatomy tests produced **4 passed, 3 failed**. The invite-flow case
  passed; the unauthenticated login-button assertion, client-without-workspace
  bootstrap timeout, and client session-recovery sign-in failure persisted.
  These are authentication smoke failures, not a green release gate. No auth
  implementation or auth test was changed in this patch.
- Logs: `tmp/exercise-catalog/pr-exlib-ui-01/verify-release.log`,
  `verification-followup.log`, `active-provider.log`, `lint-final.log`, and
  `format-final.log`. Build byte inventories are in `bundle-before.json` and
  `bundle-after.json` in the same directory.
- The two obsolete source assertions requiring hidden library tabs were updated
  to require accessible map/list presentation. Controlled API and scope assertions
  remain, with runtime integration coverage for the new behavior.

Production build measurements use raw bytes and Node gzip on emitted chunks,
with the same command before/after. The shared `exercise-queries` chunk includes
the library UI, selector, and anatomy geometry:

| Output              |   Before bytes / gzip |    After bytes / gzip | Delta bytes / gzip |
| ------------------- | --------------------: | --------------------: | -----------------: |
| Shared exercise JS  |      121,790 / 45,716 |      126,832 / 47,211 |    +5,042 / +1,495 |
| Shared exercise CSS |           3,229 / 937 |         9,731 / 2,813 |    +6,502 / +1,876 |
| All emitted JS      | 3,522,924 / 1,074,491 | 3,527,944 / 1,075,848 |    +5,020 / +1,357 |
| All emitted CSS     |      388,496 / 62,638 |      394,559 / 64,445 |    +6,063 / +1,807 |

The anatomical illustration is substantially more dimensional but remains SVG
art using the existing stylized source geometry. It does not reproduce the
reference's photorealistic rendered body, fine anatomical subdivisions, or
raster close-ups. The reference's multi-selection and Apply flow are deliberately
absent because the locked contract requires immediate single-muscle filtering.

## Historical QA — 2026-09-01

Date: 2026-09-01

Target: completed PR-EXLIB-05 Exercise Library at
`/pt/settings/exercises` using the local Supabase stack.

## Screenshot matrix

Before and after captures were produced at widths 1440, 768, and 375 with a
1800px capture height so the complete filter container and body remain visible.
Each width contains these 13 states:

- neutral front
- neutral back
- pectorals
- anterior deltoids
- lateral deltoids
- posterior deltoids
- latissimus dorsi
- rhomboids
- spinal erectors
- hip flexors
- hip abductors
- quadriceps
- hamstrings

Artifacts:

- `tmp/exercise-catalog/pr-exlib-04c/screenshots/before/`
- `tmp/exercise-catalog/pr-exlib-04c/screenshots/after/`

There are 39 before and 39 after PNGs. Width is encoded by the immediate
subdirectory and state by the file name.

## Interaction results

- All 12 front and 12 back selectable regions emitted the expected canonical
  `MuscleKey` through Enter activation.
- All 12 front and 12 back regions were pointer activated successfully after
  refining the transparent hit behavior for closed shapes.
- Supplemental private hit strokes give trapezius and gluteals an unambiguous
  target outside their overlapping rhomboid and hip-abductor regions.
- Left/right path pairs share one region definition and one canonical key.
- Selected muscle persisted while switching Front → Back → Front.
- Body map and Muscle list remained synchronized (`Biceps` stayed
  `aria-pressed="true"` after switching views).
- A fresh headed tab produced no console warnings or errors while selecting a
  muscle and switching surfaces.

## Mobile filter panel

At 375px:

- The collapsed summary displayed `Selected: Biceps`.
- Enter opened the `<details>` filter panel.
- Space closed it.
- The URL remained `?muscle=biceps` throughout.
- Document and body scroll width were both 360 CSS px, matching the document
  client width; no horizontal overflow was present.

## Bundle review

| Asset                     |   Before |    After |     Delta |
| ------------------------- | -------: | -------: | --------: |
| Exercise Library JS       | 45.53 kB | 99.81 kB | +54.28 kB |
| Exercise Library JS gzip  | 13.69 kB | 40.20 kB | +26.51 kB |
| Exercise Library CSS      |  2.57 kB |  2.64 kB |  +0.07 kB |
| Exercise Library CSS gzip |  0.82 kB |  0.82 kB |      0 kB |

Vendored source geometry plus RepSync overlays total 69,679 bytes. The complete
artwork directory, including the explicit adapter, totals 76,586 bytes.

## PR-EXLIB-04D visual integration and mobile compression

The completed PR-EXLIB-05 Exercise Library was checked again at 1440px, 768px,
and 375px. Comparison artifacts are under:

- `tmp/exercise-catalog/pr-exlib-04d/screenshots/before/`
- `tmp/exercise-catalog/pr-exlib-04d/screenshots/after/`

The headed matrix covers neutral front/back, front/back hip abductors, hip
flexors, pectorals, lateral deltoids, latissimus dorsi, quadriceps, hamstrings,
keyboard focus, Muscle list, and disabled presentation. The disabled captures
used a transient local-only render flag because the Exercise Library does not
naturally disable filtering; the flag was removed before the final diff.

### Mobile measurements

At 375px with the filter disclosure expanded:

| Element               |                  Before |                  After |        Change |
| --------------------- | ----------------------: | ---------------------: | ------------: |
| Selector height       |                  869 px |                 685 px |        -21.2% |
| Artwork canvas height |                  542 px |                 407 px |        -24.9% |
| SVG element height    |                  500 px |                 395 px |        -21.0% |
| First-result boundary | 1116 px after panel top | 932 px after panel top | 184 px sooner |

The shared horizontal artwork transform and reframed viewBox increase the
rendered front-body width from approximately 218px to approximately 260px
(about 19%) without clipping the head, hands, or feet.

### Interaction results

- All 12 front and 12 back hit regions passed pointer activation after the
  shared transform.
- All 12 front and 12 back regions emitted the expected canonical key through
  Enter activation; Space activation was also checked directly.
- Front/Back changes did not mutate the selected key.
- The Muscle list retained the map selection with `aria-pressed="true"`.
- Enter and Space toggled the mobile disclosure without changing the selected
  URL key.
- At 375px document and body width matched the 360px client width, so there was
  no horizontal overflow.
- The closed support launcher transitions out of the interaction area while
  the mobile/tablet filter disclosure is expanded.
- The final headed pass reported no console errors or React warnings.
