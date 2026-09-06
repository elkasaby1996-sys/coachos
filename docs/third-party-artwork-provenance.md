# Third-party artwork provenance

## react-muscle-highlighter male anatomy

- Upstream repository: https://github.com/soroojshehryar/react-muscle-highlighter
- Reviewed package: `react-muscle-highlighter@1.2.0`
- Adapted source commit: `981291ca88a8d27205adc7532ebb2416b7e4609f`
- Commit date: 2026-01-07
- RepSync import date: 2026-09-01
- License: MIT
- Retained license: `licenses/react-muscle-highlighter-MIT.txt`

The published npm package reports `gitHead`
`d5e25d83fb6d0d4930b72ecfa9aff8dfe957611c`. That object is not present in
the current official repository history. The repository currently declares
the same package version (`1.2.0`), so RepSync pins the audited source geometry
to the resolvable commit above and records the npm discrepancy here.

### Files reviewed

- `README.md`
- `LICENSE`
- `package.json`
- `assets/bodyFront.ts`
- `assets/bodyBack.ts`
- `components/SvgMaleWrapper.tsx`
- `index.tsx`

### Files adapted

- `assets/bodyFront.ts` into
  `src/components/pt/anatomical-muscle-selector/artwork/react-muscle-highlighter-male-front.ts`
- `assets/bodyBack.ts` into
  `src/components/pt/anatomical-muscle-selector/artwork/react-muscle-highlighter-male-back.ts`
- The male front/back outline paths from `components/SvgMaleWrapper.tsx` into
  those same vendored geometry files.

Only male outline and muscle path data were adapted. Female assets, the
upstream `Body` component, upstream event handlers, selection state, colors,
and accessibility behavior were not copied into production.

### RepSync adaptations

Upstream path colors are discarded. Direct source slugs are mapped through an
explicit adapter to RepSync `MuscleKey` values. Broad deltoid, upper-back, and
lower-back regions remain passive visual anatomy; selectable deltoids, lats,
rhomboids, and spinal erectors use original RepSync refinements. Hip-flexor and
hip-abductor overlays are original RepSync artwork because the source does not
provide those regions.

The upstream README describes the vectors as SVG body illustrations but does
not identify a separate artist or an earlier artwork source. That deeper
artwork lineage remains undocumented upstream.
