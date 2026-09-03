# 1. Recommendation

**Choose: Neither; commission custom artwork.**

Candidate A (`react-muscle-highlighter`) is the strongest visual candidate. Its silhouette, proportions, and integrated muscle treatment are a clear improvement over the current illustration. It does not, however, expose enough distinct anatomy to represent RepSync's canonical deltoid subdivisions, rhomboids, hip flexors, or hip abductors without inventing regions. Its published npm commit also cannot be resolved in the current official repository history, and the repository does not document the origin of its SVG geometry.

Candidate B (`body-muscles`) is the strongest taxonomy candidate. Its granular source regions cover nearly all `MuscleKey` values and can often be grouped safely. Its faceted, low-detail silhouette is still visibly schematic at desktop and phone sizes, so adopting it would exchange the current illustration's visual problem for a different one.

Commissioning purpose-built front/back SVG artwork is the only option that simultaneously meets the visual-quality target, preserves exact canonical coverage, retains the current controlled/accessibility architecture, and establishes a clean artwork provenance record. Candidate B is useful as a region-model benchmark, not as approved production geometry.

This recommendation is an engineering and design evaluation, not a legal conclusion.

# 2. Current illustration diagnosis

The current RepSync selector is architecturally sound:

- It is controlled only by `MuscleKey | null` through `value` and `onValueChange`.
- Every canonical muscle has a registry entry, visible shape, accessible name, and list fallback.
- Selection, focus, disabled state, front/back switching, and dark-theme colors are consistent.
- The Exercise Library consumes only the canonical selection. It does not inspect SVG/path IDs.
- At `xl`, the filter rail is sticky in an approximately one-third/two-thirds grid. Below `xl`, it moves into a full-width collapsible `<details>` panel.
- The selector wrapper uses flexible `min-width: 0`/`max-width: 100%` behavior. The artwork is capped at approximately `24rem` and uses a `240 × 520` coordinate system without requiring the page to depend on that size.

The visual shortcomings are concentrated in the artwork rather than the component contract. The silhouette is soft and mannequin-like, the proportions are not convincingly athletic, and large rounded blocks do not follow anatomical insertions or surface landmarks. Several muscles read as detached overlays rather than one coherent anatomical system. The neutral and selected states remain legible, but the illustration does not yet meet the intended professional coaching-product standard.

For the bake-off, all three artworks were normalized into the same `240 × 520` outer canvas, existing selector surface, RepSync neutral/selected tokens, canonical URL selection, and real Exercise Library page container.

# 3. Candidate versions and sources

| Candidate       | Evaluated artifact                    | Repository state                                                                                                                                                                                        | Runtime/dependency shape                                                                       | Source                                                                                                                                                                                                                                            |
| --------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current RepSync | Current working-tree selector artwork | Existing project-local implementation                                                                                                                                                                   | No additional dependency                                                                       | `src/components/pt/anatomical-muscle-selector/`                                                                                                                                                                                                   |
| Candidate A     | `react-muscle-highlighter@1.2.0`      | npm `gitHead` `d5e25d83fb6d0d4930b72ecfa9aff8dfe957611c`; that object is not present in the current official repository history. Current `main` observed at `981291ca88a8d27205adc7532ebb2416b7e4609f`. | React/SVG component, React 18/19 peers, no runtime dependencies; approximately 385 KB unpacked | [npm package](https://www.npmjs.com/package/react-muscle-highlighter), [official repository](https://github.com/soroojshehryar/react-muscle-highlighter), [license](https://github.com/soroojshehryar/react-muscle-highlighter/blob/main/LICENSE) |
| Candidate B     | `body-muscles@1.0.0`                  | npm `gitHead` `38216b99c7c67518579a2eb71895886621c864ca`, which resolves in the official repository. Current `main` observed at `15c8085ee97cb94c51f92c75224416b15f955b5c`.                             | Framework-agnostic SVG/TypeScript package, zero dependencies; approximately 259 KB unpacked    | [npm package](https://www.npmjs.com/package/body-muscles), [official repository](https://github.com/vulovix/body-muscles), [project documentation](https://vulovix.github.io/body-muscles/)                                                       |

Candidate A exposes broad slugs such as `deltoids`, `upper-back`, and `lower-back`. Candidate B exposes 40 front and 49 back definitions, including granular chest, trapezius, latissimus, triceps, forearm, gluteal, calf, and hamstring regions.

# 4. Screenshot matrix

Screenshots are retained locally under the ignored directory `tmp/exercise-catalog/pr-exlib-04c-a/screenshots/`. Each capture uses the real Exercise Library container; the temporary harness only swaps the rendered artwork after the unmodified page loads.

## Approximately 1440 px

| State            | Current                                                                                       | Candidate A                                                                                      | Candidate B                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Front neutral    | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/1440/baseline--front-neutral.png)    | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/1440/candidate-a--front-neutral.png)    | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/1440/candidate-b--front-neutral.png)    |
| Back neutral     | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/1440/baseline--back-neutral.png)     | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/1440/candidate-a--back-neutral.png)     | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/1440/candidate-b--back-neutral.png)     |
| Pectorals        | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/1440/baseline--pectorals.png)        | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/1440/candidate-a--pectorals.png)        | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/1440/candidate-b--pectorals.png)        |
| Lateral deltoids | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/1440/baseline--lateral-deltoids.png) | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/1440/candidate-a--lateral-deltoids.png) | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/1440/candidate-b--lateral-deltoids.png) |
| Latissimus dorsi | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/1440/baseline--latissimus-dorsi.png) | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/1440/candidate-a--latissimus-dorsi.png) | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/1440/candidate-b--latissimus-dorsi.png) |
| Quadriceps       | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/1440/baseline--quadriceps.png)       | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/1440/candidate-a--quadriceps.png)       | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/1440/candidate-b--quadriceps.png)       |
| Hamstrings       | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/1440/baseline--hamstrings.png)       | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/1440/candidate-a--hamstrings.png)       | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/1440/candidate-b--hamstrings.png)       |

## Approximately 768 px

| State            | Current                                                                                      | Candidate A                                                                                     | Candidate B                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Front neutral    | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/768/baseline--front-neutral.png)    | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/768/candidate-a--front-neutral.png)    | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/768/candidate-b--front-neutral.png)    |
| Back neutral     | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/768/baseline--back-neutral.png)     | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/768/candidate-a--back-neutral.png)     | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/768/candidate-b--back-neutral.png)     |
| Pectorals        | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/768/baseline--pectorals.png)        | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/768/candidate-a--pectorals.png)        | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/768/candidate-b--pectorals.png)        |
| Lateral deltoids | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/768/baseline--lateral-deltoids.png) | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/768/candidate-a--lateral-deltoids.png) | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/768/candidate-b--lateral-deltoids.png) |
| Latissimus dorsi | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/768/baseline--latissimus-dorsi.png) | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/768/candidate-a--latissimus-dorsi.png) | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/768/candidate-b--latissimus-dorsi.png) |
| Quadriceps       | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/768/baseline--quadriceps.png)       | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/768/candidate-a--quadriceps.png)       | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/768/candidate-b--quadriceps.png)       |
| Hamstrings       | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/768/baseline--hamstrings.png)       | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/768/candidate-a--hamstrings.png)       | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/768/candidate-b--hamstrings.png)       |

## 375 px

| State            | Current                                                                                      | Candidate A                                                                                     | Candidate B                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Front neutral    | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/375/baseline--front-neutral.png)    | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/375/candidate-a--front-neutral.png)    | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/375/candidate-b--front-neutral.png)    |
| Back neutral     | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/375/baseline--back-neutral.png)     | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/375/candidate-a--back-neutral.png)     | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/375/candidate-b--back-neutral.png)     |
| Pectorals        | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/375/baseline--pectorals.png)        | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/375/candidate-a--pectorals.png)        | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/375/candidate-b--pectorals.png)        |
| Lateral deltoids | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/375/baseline--lateral-deltoids.png) | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/375/candidate-a--lateral-deltoids.png) | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/375/candidate-b--lateral-deltoids.png) |
| Latissimus dorsi | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/375/baseline--latissimus-dorsi.png) | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/375/candidate-a--latissimus-dorsi.png) | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/375/candidate-b--latissimus-dorsi.png) |
| Quadriceps       | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/375/baseline--quadriceps.png)       | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/375/candidate-a--quadriceps.png)       | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/375/candidate-b--quadriceps.png)       |
| Hamstrings       | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/375/baseline--hamstrings.png)       | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/375/candidate-a--hamstrings.png)       | [PNG](../tmp/exercise-catalog/pr-exlib-04c-a/screenshots/375/candidate-b--hamstrings.png)       |

# 5. Visual scorecard

Scores are unweighted, from 1 (poor) to 5 (excellent). Every capture was reviewed at all three target widths.

| Criterion                  | Current RepSync                                              | Candidate A                                                       | Candidate B                                                                                 |
| -------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Silhouette quality         | **2** — recognizable but mannequin-like and soft             | **4** — cohesive, detailed human silhouette                       | **3** — complete but visibly faceted and angular                                            |
| Athletic proportions       | **2** — broad blocks do not convey athletic anatomy          | **4** — lean, athletic proportions read immediately               | **3** — athletic intent, but geometry feels diagrammatic                                    |
| Front/back consistency     | **4** — consistent scale and visual language                 | **4** — well-matched front/back models                            | **4** — consistent faceted construction on both sides                                       |
| Neutral-state polish       | **3** — calm and legible but visually plain                  | **4** — muscle separation remains refined in neutral color        | **3** — readable, although dense seams add noise                                            |
| Muscle integration         | **2** — many regions feel overlaid on a mannequin            | **4** — anatomy forms one integrated body                         | **3** — connected, but polygon seams dominate                                               |
| Anatomical clarity         | **3** — canonical groups are clear but simplified            | **4** — strong surface anatomy where regions exist                | **4** — granular boundaries are explicit and inspectable                                    |
| Dark-theme compatibility   | **5** — already token-driven and proven                      | **4** — normalizes cleanly, but fine outlines need tuning         | **4** — token colors work; dense seams need contrast tuning                                 |
| Selected-state quality     | **5** — high contrast and established focus treatment        | **4** — selected muscles are prominent without losing form        | **4** — granular selection is clear but outlines look busier                                |
| 375 px readability         | **4** — large simplified targets remain clear                | **4** — silhouette and major selections remain legible            | **3** — small polygons and seams become visually dense                                      |
| Hit-area feasibility       | **5** — canonical hit areas already implemented              | **4** — broad source regions are practical click targets          | **4** — granular paths can be grouped, but aggregation is required                          |
| Canonical mapping coverage | **5** — all 21 keys are intentionally represented            | **2** — several locked keys are broad or absent                   | **4** — 20 keys map; rhomboids are absent and hip abductors are approximate                 |
| Accessibility integration  | **5** — keyboardable shapes plus accessible list fallback    | **2** — source paths lack a complete keyboard/name model          | **4** — source paths expose button-like semantics, but canonical grouping remains necessary |
| Bundle/dependency fit      | **5** — no added package                                     | **4** — no runtime dependencies, but React-specific               | **5** — zero-dependency and framework-agnostic                                              |
| Maintainability            | **4** — local registry is direct, though geometry is bespoke | **3** — adapter plus coverage exceptions would be permanent       | **4** — explicit data model is easy to inspect and aggregate                                |
| License/provenance clarity | **5** — no new third-party artwork introduced                | **2** — MIT text is clear; artwork lineage and npm commit are not | **4** — Apache/NOTICE obligations and npm commit are clear; artwork derivation is unstated  |
| **Unweighted total**       | **59 / 75**                                                  | **53 / 75**                                                       | **56 / 75**                                                                                 |

The total is not a selection formula. Candidate A leads the first ten visual/interaction criteria (`40 / 50`), but its locked-taxonomy and provenance gaps are disqualifying. Candidate B's feature count and coverage do not compensate for a silhouette that still misses the visual bar.

# 6. Canonical MuscleKey coverage

“Grouped safely” means the source is more granular than the existing taxonomy and all listed source regions can be collapsed into one canonical selection without changing `MuscleKey`.

| MuscleKey            | Current            | Candidate A  | Candidate B                            | Mapping quality                                        | Notes                                                                      |
| -------------------- | ------------------ | ------------ | -------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| `pectorals`          | Pectorals          | `chest`      | `chest-upper-*` + `chest-lower-*`      | Current exact; A exact; B grouped safely               | B offers upper/lower and bilateral geometry.                               |
| `anterior_deltoids`  | Anterior deltoids  | `deltoids`   | `shoulder-front-*`                     | Current exact; A broad approximation; B exact          | A cannot separate deltoid heads.                                           |
| `lateral_deltoids`   | Lateral deltoids   | `deltoids`   | `shoulder-side-*`                      | Current exact; A broad approximation; B exact          | A selects all deltoids.                                                    |
| `posterior_deltoids` | Posterior deltoids | `deltoids`   | `deltoid-rear-*`                       | Current exact; A broad approximation; B exact          | B exposes posterior geometry on the back.                                  |
| `biceps`             | Biceps             | `biceps`     | `biceps-*`                             | Exact for all                                          | Bilateral source paths group safely.                                       |
| `triceps`            | Triceps            | `triceps`    | `triceps-long-*` + `triceps-lateral-*` | Current/A exact; B grouped safely                      | B separates two triceps heads.                                             |
| `forearms`           | Forearms           | `forearm`    | flexor/extensor forearm regions        | Current/A exact; B grouped safely                      | B's flexor/extensor paths can share one canonical value.                   |
| `rectus_abdominis`   | Rectus abdominis   | `abs`        | upper/lower abdominal regions          | Current/A exact; B grouped safely                      | B subdivisions remain one canonical selection.                             |
| `obliques`           | Obliques           | `obliques`   | `obliques-*`                           | Exact for all                                          | B only makes the front obliques explicit.                                  |
| `hip_flexors`        | Hip flexors        | Missing      | `hip-flexor-*`                         | Current/B exact; A missing                             | No defensible A source region.                                             |
| `trapezius`          | Trapezius          | `trapezius`  | upper/mid/lower trap regions           | Current/A exact; B grouped safely                      | B offers six bilateral subdivisions.                                       |
| `latissimus_dorsi`   | Latissimus dorsi   | `upper-back` | upper/mid/lower lat regions            | Current exact; A broad approximation; B grouped safely | A's upper-back region also covers non-lat anatomy.                         |
| `rhomboids`          | Rhomboids          | Missing      | Missing                                | Current exact; A/B missing                             | Neither package exposes a defensible rhomboid region.                      |
| `spinal_erectors`    | Spinal erectors    | `lower-back` | `lower-back-erectors-*`                | Current/B exact; A broad approximation                 | A's lower-back slug is not specific to erectors.                           |
| `gluteals`           | Gluteals           | `gluteal`    | gluteus medius/maximus regions         | Current/A exact; B grouped safely                      | B subdivisions can collapse into the canonical group.                      |
| `hip_abductors`      | Hip abductors      | Missing      | gluteus medius only                    | Current exact; A missing; B broad approximation        | B lacks the complete abductor group; gluteus medius alone is insufficient. |
| `quadriceps`         | Quadriceps         | `quadriceps` | `quads-*`                              | Exact for all                                          | Bilateral paths group safely.                                              |
| `hamstrings`         | Hamstrings         | `hamstring`  | medial/lateral hamstring regions       | Current/A exact; B grouped safely                      | B subdivisions can share one canonical value.                              |
| `adductors`          | Adductors          | `adductors`  | `adductors-*`                          | Exact for all                                          | All candidates visibly expose the group.                                   |
| `calves`             | Calves             | `calves`     | gastrocnemius/soleus regions           | Current/A exact; B grouped safely                      | B's three calf subdivisions per side can be aggregated.                    |
| `tibialis_anterior`  | Tibialis anterior  | `tibialis`   | `tibialis-anterior-*`                  | Exact for all                                          | Candidate A's label is shorter but its front-shin geometry is unambiguous. |

Coverage summary:

- Current: 21 exact canonical representations.
- Candidate A: 14 exact, 5 broad/missing distinctions, and 2 wholly missing groups. The undifferentiated deltoid source causes three canonical keys to collide.
- Candidate B: 10 direct exact mappings, 9 safe granular groupings, 1 broad approximation (`hip_abductors`), and 1 missing group (`rhomboids`).

# 7. Integration complexity

## Candidate A

Complexity is **medium-high**. A production adapter would translate `MuscleKey` values into broad package slugs, normalize all package colors into RepSync tokens, restore canonical accessible names and keyboard behavior, and retain the list fallback. The adapter cannot solve absent geometry. Treating one `deltoids` path as three different keys or treating `upper-back` as both lats and rhomboids would violate the locked taxonomy and create ambiguous filtering.

The component is React-native and has no runtime dependencies, but its packaged SVG and interaction model would still become a permanent third-party surface. It should not be integrated unless source provenance is resolved and replacement geometry is commissioned for missing canonical groups.

## Candidate B

Complexity is **medium**. Its explicit data arrays are easier to adapt: a registry can group bilateral and granular IDs into existing canonical keys, then emit only `MuscleKey | null`. The adapter would need canonical hover/focus aggregation, one selected state across multiple paths, larger effective hit areas for small regions, and a policy for overlaps such as gluteus medius being relevant to both gluteals and abductors.

The package is framework-agnostic and dependency-free. It still cannot represent rhomboids, and visually polishing the geometry would be substantial enough that a custom artwork commission is cleaner than modifying the package into a different illustration.

## Custom artwork

Complexity is **medium-high once**, but low afterward. A commissioned deliverable can use RepSync's exact 21-key registry, provide balanced front/back geometry, include deliberately generous hit regions, and retain the current component/state contracts. This avoids maintaining permanent exception tables for anatomy that the source never contained.

# 8. Accessibility implications

The current production selector remains the reference behavior: canonical accessible names, keyboard-operable body regions, visible focus, disabled-state handling, front/back semantics, live selected-state copy, and an equivalent muscle-list view.

Candidate A's root SVG has an image label, but its clickable muscle paths do not provide a complete per-region keyboard/button/name model. A production adapter would need to add canonical roles, labels, focus management, and grouping semantics rather than relying on package path IDs. The existing accessible list must remain available.

Candidate B's component model is closer to the target because its paths have region names and button-like keyboard behavior. Its source regions are more granular than RepSync's public taxonomy, so focus, hover, and activation would still need to operate on canonical groups. Presenting every bilateral subdivision as a separate tab stop would be noisy and inconsistent with the controlled API.

At 375 px, the unmodified Exercise Library mobile filter summary displayed `Selected: Latissimus dorsi`. The native summary opened and closed with `Enter`; the URL remained `?muscle=latissimus_dorsi` through both transitions. With the panel open and closed, the document's measured `scrollWidth` equaled its `clientWidth` (`360 px` in the browser's content viewport), confirming no horizontal overflow. Selection did not reset.

# 9. License and provenance considerations

## Candidate A — `react-muscle-highlighter@1.2.0`

- License identifier: MIT.
- Required notice in the evaluated package: `Copyright (c) 2024 My Muscle Contributors` plus the MIT license text.
- NOTICE: no separate NOTICE file was published in the evaluated package.
- Provenance concern: npm records `gitHead` `d5e25d83fb6d0d4930b72ecfa9aff8dfe957611c`, but that object was not resolvable in the current official repository clone. The current repository therefore does not provide a directly auditable path to the exact published source commit.
- Artwork concern: the README describes SVG body illustrations but does not identify their artist, upstream project, or derivation history. No evidence of a specific upstream asset was found; that is not evidence that the geometry is original.
- If later approved for vendoring or modification, the repository would need to retain the MIT license/copyright in its third-party attribution records and record the exact tarball integrity, package version, repository URL, and reviewed SVG provenance. Modification appears permitted by the license text, subject to its notice requirement and a separate provenance review.

## Candidate B — `body-muscles@1.0.0`

- License identifier: Apache-2.0.
- Copyright: `Copyright 2024 Ivan Vulović`.
- NOTICE content identifies “Body Muscles,” Ivan Vulović, and `https://github.com/vulovix/body-muscles`.
- Provenance trace: npm `gitHead` `38216b99c7c67518579a2eb71895886621c864ca` resolves in the official repository.
- Artwork concern: no external/derived artwork source was identified in the evaluated README, LICENSE, NOTICE, or package contents. The project also does not provide an explicit artwork-derivation statement, so that question should remain in provenance review.
- If later approved for vendoring or modification, RepSync would need to retain the Apache-2.0 license, preserve relevant notices, include the NOTICE attribution, and add prominent modification notices to changed files. Attribution/provenance records should identify the exact package, commit, tarball integrity, source files, and any locally modified SVG/data files. Modification appears permitted by the license text subject to those obligations and review.

No candidate code or geometry was copied into production in this evaluation. License compatibility and artwork ownership should be reviewed by the appropriate owner before any production decision.

# 10. Recommended production integration approach

1. Commission one coordinated front/back SVG set with athletic but inclusive proportions and a restrained level of anatomical detail suited to a professional coaching product.
2. Contract for an explicit originality/derivation statement, editable vector source, production SVG export, and rights/attribution terms. Store those records with the asset provenance documentation.
3. Require visible geometry for all 21 current `MuscleKey` values. Deltoid heads, rhomboids, erectors, hip flexors, hip abductors, adductors, tibialis anterior, forearms, and obliques must be reviewed individually before acceptance.
4. Keep the existing `AnatomicalMuscleSelector` public API and Exercise Library integration unchanged. Artwork registry entries should map authored region IDs to canonical keys inside the selector only.
5. Separate visible geometry from forgiving transparent hit geometry when small muscles need larger pointer targets. One canonical key may own multiple bilateral paths, but activation must emit only that key.
6. Preserve token-based neutral, selected, hover, focus, and disabled states; the accessible list remains a first-class equivalent control.
7. Validate the commissioned artwork in this same `1440 / 768 / 375` matrix before replacing the baseline. Re-run selector, browser, page-contract, taxonomy, classification, gateway, workout-template insertion, TypeScript/build, lint, format, and diff checks.

# 11. Files temporarily changed

Temporary evaluation-only artifacts were created during capture:

- `public/__candidate-evaluation.html`
- `public/__candidate-markup.json`
- `tmp/exercise-catalog/pr-exlib-04c-a/generate-harness.cjs`
- exact npm tarballs/extracted packages and official repository clones under `tmp/exercise-catalog/pr-exlib-04c-a/`

The public harness and candidate package/source copies were removed after capture. No temporary app navigation was added. `package.json` and package lock files were never changed, and neither candidate was installed as a repository dependency.

The only retained evaluation outputs are this report and 63 ignored PNGs under:

- `tmp/exercise-catalog/pr-exlib-04c-a/screenshots/1440/`
- `tmp/exercise-catalog/pr-exlib-04c-a/screenshots/768/`
- `tmp/exercise-catalog/pr-exlib-04c-a/screenshots/375/`

# 12. Cleanup confirmation

- The temporary preview page, generated public JSON, source clones, tarballs, extracted packages, generator, and smoke captures were removed.
- No production route or navigation entry remains.
- No candidate dependency remains in `package.json` or a lock file.
- No selector, Exercise Library behavior, database file, provider request, workout flow, or persistence code was changed by this evaluation.
- The current RepSync `AnatomicalMuscleSelector` remains the active production implementation.
- All selector production files and their selector test are tracked in Git's index; a clean checkout containing the staged PR work will include them.
