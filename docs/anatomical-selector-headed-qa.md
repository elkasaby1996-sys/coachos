# Anatomical selector headed QA

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
