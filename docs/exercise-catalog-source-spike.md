# 1. Executive recommendation

**Conditional Go.** RepSync can add a self-hosted, globally shared catalog
without changing the durable workout path. The existing owner-scoped
`public.exercises` UUID is already the correct boundary between discovery data
and workouts, assignments, execution, and history.

Production work is blocked on four gates:

1. Validate the real sample schema and stable identifier contract.
2. Review the purchased license for database hosting, derivative media,
   redistribution, client playback, backups, and retained old versions.
3. Measure full metadata/media size and update cadence.
4. Prove reconciliation against existing `source = 'exercise_dataset'` rows
   without changing any `public.exercises.id`.

This spike does not approve a purchase, make a legal conclusion, or switch the
current provider.

# 2. Sample and evidence reviewed

The expected local sample
`tmp/exercise-catalog/exercisedb-pro-sample.json` was not present during this
spike. Consequently, the vendor top-level shape, record path, field names,
identifier format, nullability, arrays, taxonomies, relationship model, media
conventions, and version metadata remain **unvalidated**. No substitute vendor
schema was invented.

The local-only directory is now ignored by Git. Run the structural audit after
placing an authorized sample there:

```bash
npm run exercise-catalog:audit
```

If records are inside a known nested array:

```bash
npm run exercise-catalog:audit -- --records-path=data.exercises
```

The audit reports only file size/hash, top-level structure, record count,
field paths, presence/null/type counts, scalar distinct counts, string lengths,
array shapes, object keys, URI/path categories, and file-extension counts. It
does not emit field values or complete records. Its default safety limit is 50
MiB and can be raised intentionally with `--max-bytes=<bytes>`.

Repository evidence reviewed includes:

- `public.exercises` is owner-scoped and retains `source`,
  `source_exercise_id`, and `source_payload`.
- Unique indexes protect owner/name and owner/source/source-ID combinations.
- Provider imports currently use the generic `exercise_dataset` namespace and
  copy a normalized subset plus raw payload into the owner record.
- Workout templates, assigned workouts, and set logs reference the internal
  `public.exercises.id` UUID.
- Programs reference workout templates, not provider or exercise catalog IDs.
- Client personal exercises use `owner_user_id = auth.uid()` with no workspace
  and remain a separate ownership path.

# 3. Vendor schema

No ExerciseDB Pro schema claims can be made until the sample is supplied. The
following must be recorded from aggregate audit output before production
design is accepted:

- JSON root and exercise collection path.
- Stable ID types, formats, uniqueness, and behavior across versions.
- Required, optional, nullable, scalar, and array fields.
- Body-region, primary-muscle, secondary-muscle, and equipment shapes.
- Instruction, description, difficulty, category, and movement-taxonomy
  shapes.
- Similar, substitution, progression, and regression relationship direction.
- Media item shape, formats, resolutions, filenames, and missing-media states.
- Dataset-level version, publication time, and change metadata.

The pure mapper therefore accepts an explicit `ExerciseCatalogSourceContract`.
Its field paths must be configured from audited evidence rather than embedded
as guessed vendor property names.

# 4. Field mapping

The “Vendor field” entries below are contract roles, not claims about actual
ExerciseDB Pro names.

| Vendor field                      | Catalog candidate          | `public.exercises` destination                           | Persisted when selected? | Notes                                                                                                                      |
| --------------------------------- | -------------------------- | -------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Unconfirmed ID path (`fields.id`) | `sourceExerciseId: string` | `source_exercise_id` or explicit catalog link            | Yes                      | Finite numbers and nonempty strings normalize to strings. Stable cross-version semantics must be proven.                   |
| Configured source namespace       | `source`                   | `source` or catalog link source                          | Yes                      | Recommend `exercisedb_pro` only after source identity and license are confirmed.                                           |
| Dataset release identifier        | `sourceVersion`            | Catalog version/link metadata                            | Yes, in provenance       | Do not overwrite owner edits on version changes.                                                                           |
| Unconfirmed name path             | `name`                     | `name`                                                   | Yes on create            | Missing/blank names reject the record. Renames do not automatically overwrite owner names.                                 |
| Unconfirmed body-region path      | `bodyRegions[]`            | No automatic canonical destination                       | Conditional              | Current scalar `muscle_group`/`category` cannot represent every possible source taxonomy safely.                           |
| Unconfirmed primary-muscle path   | `primaryMuscles[]`         | `primary_muscle` only through an explicit mapping policy | Conditional              | Candidate remains plural; do not collapse or canonicalize during ingestion.                                                |
| Unconfirmed secondary-muscle path | `secondaryMuscles[]`       | `secondary_muscles[]`                                    | Conditional              | Preserve source labels separately from future canonical keys.                                                              |
| Unconfirmed equipment path        | `equipment[]`              | `equipment`                                              | Conditional              | Owner table is scalar; multiple values require a reviewed display choice or future schema change.                          |
| Unconfirmed instruction path      | `instructions[]`           | `instructions`                                           | Conditional on create    | Existing owner field is text; join paragraphs only at resolution time. Never overwrite local edits during catalog updates. |
| Unconfirmed description path      | `description`              | None by default; optionally seed `notes` on create       | Conditional              | Owner notes are editable coaching content and must not be overwritten by source updates.                                   |
| Unconfirmed difficulty path       | `difficulty`               | None currently                                           | No                       | Retain in catalog until RepSync defines semantics.                                                                         |
| Unconfirmed category path         | `category`                 | `category` only after semantic review                    | Conditional              | Existing category usage may not match source categories.                                                                   |
| Unconfirmed media collection      | `media[]`                  | One selected derivative may seed `video_url`             | Conditional              | Keep full media inventory catalog-side; do not place source paths directly into workout rows.                              |
| Unconfirmed relationship paths    | `relationships.*[]`        | None                                                     | No                       | Persist as catalog-to-catalog edges.                                                                                       |
| Remaining record fields           | Bounded `sourceMetadata`   | Prefer catalog metadata, not duplicated owner payload    | No by default            | Mapper caps metadata at 16 KiB and marks truncation. Production allowlist should replace broad retention.                  |

# 5. Identifier and deduplication model

Use two identities:

- Internal catalog identity: immutable RepSync UUID.
- Source identity: unique `(source, source_exercise_id)` with version history.

Do not use normalized name as identity. Names may change, collide, or describe
different movements. Version imports should stage records, reject duplicate
source IDs within a release, compare checksums, and retain a stable internal
catalog UUID across updates.

Recommended uniqueness:

- Catalog items: unique `(source, source_exercise_id)`.
- Version membership/snapshots: unique `(catalog_item_id, source_version_id)`.
- Owner links: unique `(owner_user_id, catalog_item_id)`.
- Existing owner record constraints remain unchanged.

The current provider may share an upstream dataset with the proposed download.
Treat that as unproven. Only an audited, deterministic crosswalk may connect an
existing `exercise_dataset` ID to a catalog item; name equality alone is not a
crosswalk.

# 6. Global catalog schema recommendation

One catalog table is not sufficient once updates, relationships, and multiple
media derivatives are required. The smallest safe production model is:

1. `exercise_catalog_sources` / `exercise_catalog_versions`: source namespace,
   vendor version, import checksum, import state, counts, activation and
   retirement timestamps.
2. `exercise_catalog_items`: stable UUID, source ID, active/removed state,
   current source version, name, source taxonomy arrays, description fields,
   search document, bounded metadata, record checksum, timestamps.
3. `exercise_catalog_item_versions`: optional immutable snapshots or normalized
   change records when rollback/audit requirements justify them.
4. `exercise_catalog_relationships`: typed directed edges for similar,
   substitution, progression, and regression relationships.
5. `exercise_catalog_media`: media kind, source version/path, storage path,
   resolution, MIME type, byte size, checksum, availability state.
6. `exercise_catalog_owner_links`: owner, catalog item, existing
   `public.exercises.id`, provenance state, and timestamps.

For the MVP, retain source muscles, regions, and equipment as indexed text
arrays. Do not normalize them into canonical dimension tables until the real
cardinality and future selector requirements are known. Relationship and media
rows should be separate because they are many-valued, independently versioned,
and operationally updated.

Enforce read-only behavior with no authenticated insert/update/delete grants.
Only a service-role import job may mutate catalog tables. RLS should expose
catalog reads to authorized PT roles/owners only; unrelated client accounts
must not receive general catalog access. Clients continue seeing selected
owner exercises through existing workout policies.

Search should be server-side with indexed normalized name/full-text fields,
optional exact source-taxonomy filters, deterministic `(sort_key, id)` cursor
pagination, and bounded page sizes. Avoid offset pagination for the full
catalog. Primary and secondary muscle arrays must remain distinct so a future
selector can request primary-only, secondary-only, or either without parsing a
combined string.

# 7. Catalog-to-owner resolution contract

Resolution must return a `public.exercises.id`, never a catalog ID.

Recommended decision order:

```text
resolve(owner, catalogItem):
  1. Find owner + exact source + source exercise ID provenance.
  2. Find an explicit exercise_catalog_owner_links row.
  3. If normalized owner/name collides, return NEEDS_REVIEW; do not auto-merge.
  4. Otherwise create one owner exercise and its catalog link transactionally.
  5. Return public.exercises.id.
```

Implement this eventually as one server-side transaction/RPC. Serialize on
`(owner_user_id, catalog_item_id)` and rely on unique constraints to make
repeat/concurrent selection idempotent. On a race, re-read the winning link.
An owner/name uniqueness conflict should return a review state containing both
UUIDs, not silently treat the records as identical.

Existing `exercise_dataset` rows require a dry-run crosswalk:

- Exact, proven source-ID equivalence: attach a catalog link to the existing
  UUID; do not delete/recreate it.
- Name-only similarity: queue for review.
- No match: leave unchanged.
- Provider rename or catalog removal: retain the owner row and link; mark only
  catalog availability/provenance state.
- Catalog version update: refresh catalog data, not owner-edited fields.

# 8. Media storage recommendation

Use a dedicated private bucket such as `exercise-catalog-media` unless the
license explicitly permits public redistribution. Serve short-lived signed
URLs or an authenticated media endpoint to authorized PTs and clients viewing
an assigned owner exercise. Do not make a licensing-sensitive source bucket
public by default.

Recommended immutable object path:

```text
<source>/<source-version>/<source-exercise-id>/<checksum-prefix>-<resolution>.<ext>
```

The import job should validate allowed MIME type against decoded content,
extension, maximum bytes, and media dimensions/duration; calculate SHA-256;
and reject traversal, executable, or mismatched content. Record checksums in
`exercise_catalog_media`. Deduplicate within the same licensed source/version
scope; do not deduplicate across sources if that would blur licensing or
provenance.

Versioned paths may use long immutable cache headers. Signed URL lifetime and
CDN caching must remain compatible with revocation. Missing/invalid media falls
back to the existing image/video placeholder and never blocks exercise
selection.

The current UI consumes at most one motion URL and one image URL. The MVP
should therefore retain one web-appropriate motion derivative and, if useful,
one still thumbnail—not every vendor resolution. Select actual formats and
dimensions only after auditing sample media and measuring UI/network needs.
Keep the prior version until the new metadata and media set is verified;
rollback means atomically reactivating the prior version, not overwriting its
objects.

# 9. Dataset versioning and update strategy

Treat imports as immutable releases:

1. Create a staging version row with source file checksum and counts.
2. Parse and map with a version-pinned contract.
3. Reject invalid IDs/names, duplicate source IDs, broken relationships, and
   unsafe media; record aggregate failure counts only.
4. Upsert stable catalog identities, write version membership/snapshots, and
   mark absent prior items as removed for the new release.
5. Verify row/media/checksum/search counts.
6. Atomically activate the version.
7. Retain the prior version for a measured rollback window.

Removed vendor records must be soft-retired (`is_active = false`,
`removed_in_version_id`, `retired_at`). Never cascade removal to owner
exercises or historical references. Contract/schema versions should be stored
separately from vendor dataset versions so adapter changes are auditable.

# 10. Existing exercise reconciliation

Before switching search, generate a read-only reconciliation report grouped by
owner:

- Manual/custom records (`source = 'manual'`): never auto-link or alter.
- Client-owned personal records: exclude from catalog reconciliation.
- Imported `exercise_dataset` records: compare exact source IDs only after
  upstream equivalence is proven; otherwise review.
- Duplicate source IDs or owner/name collisions: explicit conflict queue.
- `source_payload`: parse only for crosswalk evidence with a versioned,
  testable extractor; do not assume all historical payloads share a shape.
- WTE/AWE/log references: inventory counts by exercise UUID before and after;
  never rewrite them merely to add provenance.

No used exercise is deleted/recreated. No two UUIDs are merged by name alone.
No existing exercise is split into a new UUID automatically. Owner edits win
over catalog refreshes.

# 11. Muscle-taxonomy implications

Three models must remain separate:

1. **Source taxonomy:** exact vendor labels/IDs retained in catalog fields.
2. **Future canonical RepSync taxonomy:** separately versioned mappings created
   only after the anatomical selector requirements and sample cardinality are
   known.
3. **Graphic/SVG presentation metadata:** region geometry, view, label
   placement, colors, and asset identifiers; never inferred from source text.

The existing `normalize_exercise_library_label` migration demonstrates a
coarse display grouping, not a sufficiently evidenced canonical anatomical
model. The mapper intentionally preserves arrays and does not call that
normalizer. A future mapping table should support many-to-many source terms,
primary/secondary roles, confidence/review state, and taxonomy version.

# 12. Licensing and repository-handling constraints

No legal conclusion is made here. Before production, obtain review of:

- Rights to self-host metadata and media.
- Rights to transform GIF/image/video assets and serve derivatives.
- PT and client viewing/streaming rights.
- CDN caching, backups, disaster recovery copies, and old-version retention.
- Attribution, branding, geographic, account-count, and termination duties.
- Whether source records or media may appear in logs, support exports, or test
  fixtures.

Vendor samples, full datasets, raw dumps, keys, GIFs, images, and videos must
remain outside Git. Tests use only short synthetic shapes and language. Audit
output containing only aggregates may be retained privately for review, but
should not be committed until its licensing and disclosure risk is checked.

# 13. Storage and cost calculation framework

No production quantities are guessed because the sample/full dataset is not
available. Measure these variables:

- `N`: active catalog items; `V`: retained versions.
- `B_item`, `B_index`, `B_snapshot`: average metadata row, index, and version
  snapshot bytes.
- `R`, `B_rel`: relationship count and average relationship row/index bytes.
- `M_kind,res`, `B_kind,res`: media count and average bytes by kind/resolution.
- `P`: search page size; `B_page`: compressed metadata response bytes.
- `B_demo`: average bytes transferred for one demo playback after cache hit
  behavior is measured.
- `Q_browse`, `Q_demo`: monthly browse pages and demo views.
- `T_parse`, `T_media`, `T_index`: measured import throughput.

Calculations:

```text
metadata_storage = N * (B_item + B_index) + R * B_rel
version_storage = retained_snapshot_rows * B_snapshot
media_storage = sum(M_kind,res * B_kind,res) across retained versions
browse_egress = Q_browse * B_page
demo_egress = Q_demo * B_demo * (1 - measured_cache_hit_rate)
first_import_time = metadata_bytes / T_parse + media_bytes / T_media + index_work / T_index
update_import_time = changed_metadata_bytes / T_parse + changed_media_bytes / T_media + reindex_work / T_index
backup_storage = metadata_storage * retained_backup_copies
rollback_retention = prior_version_metadata + prior_version_media
```

Apply current Supabase database, Storage, CDN/egress, compute, and backup rates
only when preparing a purchase/deployment decision. Record compressed and
uncompressed metadata sizes, every media-resolution total, cold/warm cache
behavior, and changed-record percentage from at least two releases.

# 14. Risks and failure states

- Sample/schema/license gates remain unresolved.
- Vendor IDs may not be stable across releases.
- Current provider IDs may look compatible while representing a different
  namespace or version.
- Source taxonomy may not map one-to-one to existing scalar owner fields.
- Name collisions can cause unsafe implicit merges if the current fallback is
  reused unchanged.
- Media redistribution or derivative rights may be narrower than metadata
  rights.
- Large media versions may dominate storage, egress, backup, and rollback cost.
- Incomplete imports or missing media could produce mixed-version results
  without atomic activation.
- Broad `source_payload` retention can duplicate licensed content and inflate
  owner rows; production should use an allowlist and catalog links.
- RLS mistakes could expose the global catalog to unrelated clients.
- Signed URL caching can complicate revocation.
- Removed records must not break already-selected owner exercises.

# 15. Proposed production PR sequence

1. **EXLIB-02B — Licensed sample validation:** run the audit, pin the real
   source contract, add schema fixtures, verify IDs/version/media/license gates.
2. **EXLIB-03 — Catalog schema and RLS:** reviewed migration for versions,
   items, relationships, media metadata, and PT-only reads; no provider switch.
3. **EXLIB-04 — Versioned importer:** staging, checksums, dry-run reports,
   atomic activation, removal semantics, and operational metrics.
4. **EXLIB-05 — Media pilot:** ingest only the selected MVP derivatives into a
   non-production private bucket and measure storage/egress.
5. **EXLIB-06 — Owner resolver and reconciliation:** transactional resolver,
   explicit links, collision review, existing-import dry run, UUID invariants.
6. **EXLIB-07 — Catalog search behind the gateway:** server-side search/cursor
   pagination and feature-flagged source switch with rollback.
7. **Separate taxonomy/selector PRs:** canonical muscle mapping and anatomical
   graphics only after catalog evidence is accepted.

# 16. Open questions

- What is the exact sample/root/record schema and dataset version field?
- Are IDs stable, globally unique, and preserved across renamed/removed items?
- Are primary muscles singular or plural, and are relationships IDs or embedded
  records?
- Which media files/resolutions/codecs exist and which are licensed for
  derivative hosting and client playback?
- Is the current runtime provider derived from the same source, and is there an
  authoritative ID crosswalk?
- What are full-release metadata/media sizes and typical update deltas?
- How often are releases published, and must multiple releases remain online?
- Which source taxonomy values need future canonical mapping?
- Should clients receive signed catalog media only after owner selection?
- What audit/attribution/termination obligations apply to retained versions and
  backups?

# 17. Exact files reviewed and changed

Reviewed:

- `AGENTS.md`, `package.json`, `.gitignore`, and Supabase configuration.
- `src/lib/exercise-domain.ts`, `exercise-query-contracts.ts`,
  `exercise-queries.ts`, and `exercise-dataset.ts`.
- `supabase/functions/_shared/exercise-dataset-gateway.ts` and
  `supabase/functions/exercise-dataset-search/index.ts`.
- `src/pages/pt/settings-exercises.tsx` and
  `src/pages/pt/workout-template-builder.tsx`.
- Baseline exercise/WTE/AWE/log schema and the owner-scoped exercise,
  imported-label normalization, and client personal-exercise migrations.
- PR-EXLIB-00 domain/query/dataset tests and PR-EXLIB-01 gateway tests.
- `docs/exercise-dataset-gateway.md` and deployment/command documentation.

Changed by this spike:

- `.gitignore`
- `package.json`
- `scripts/audit-exercise-catalog-sample.mjs`
- `src/lib/exercise-catalog-candidate.ts`
- `tests/unit/exercise-catalog-candidate.test.ts`
- `docs/exercise-catalog-source-spike.md`

No migration, UI, gateway, provider, storage policy, or production data change
is included.
