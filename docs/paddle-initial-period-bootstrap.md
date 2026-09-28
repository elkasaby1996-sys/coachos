# Paddle initial period bootstrap

CODEX-41 is local implementation based on
`ecfb17dc2f72c7b19e79791bfbe5639e3df44321`. It makes no staging or provider calls.

## Cause and compatibility

The initial proof correlates the authenticated subscription creation and paid
transaction but omits period fields. Subscription creation normalization does
not include lifecycle fields; transaction normalization can retain an explicit
`billingPeriod`. The initial reconciler inserts the paid canonical without a
period. Its processed retry preserves that state. Seat and plan eligibility
correctly require proven matching period bounds.

`paddle-initial-purchase-v1` facts, evidence, hashes, and payment applications
remain unchanged. The new forward migration adds one separate private table,
`billing_paddle_initial_period_bootstraps`, with version `paddle-initial-period-v1`.
Each record binds one shadow, canonical, consumed payment, original initial
facts and explicit period. Existing immutable evidence guards remain intact.

## Authority and state transitions

The service-only `bootstrap_paddle_initial_period_v1(uuid)` receives an internal
shadow UUID. It takes the existing policy/account locks, locks the shadow and
canonical, recomputes the original initial proof and verifies its exact equality
with the consumed initial transaction evidence. The transaction event selected
by that payment supplies the period, and its authenticated delivery chain is
revalidated. No timestamps or provider references are accepted from the caller.

| State                                                                                                                                     | Result                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Original paid active Growth Monthly, zero extras, no open operation, all four bounds null, valid explicit transaction period              | Insert proof and set both pairs atomically |
| Same eligible state, no explicit transaction period                                                                                       | `not_available`; no writes                 |
| Stored bootstrap proof and both period pairs still exactly match                                                                          | `reused`; no writes or timestamp updates   |
| Mixed nulls, existing unproven/mismatching bounds, different authority, later lifecycle/plan/seat proof, or pending lifecycle observation | Reject; no writes                          |

Known stale retained lifecycle observations remain immutable audit history and
cannot supply bootstrap authority. They do not veto initial-period recovery or
missing-period activation. Linked ingress can retain an older update as
`correlated`; that row is excluded from the veto only when both authenticated
`occurredAt` and `updatedAt` are strictly behind the stored `provider_updated_at`.
This handles delayed historical delivery without treating arrival order as
revision authority. Both timestamp strings must be present; incomplete non-stale
observations default to blocking, including active updates without `updatedAt`.
Equal/newer clocks, pending state and manual-review ambiguity continue to block.
A stale row never exempts another row in the same set. Trusted ingress rejects
missing `occurredAt` before retention. Stale classification comes from trusted
ingress and remains harmless even when optional lifecycle fields are omitted.

The period must contain the authenticated initial settlement (`start <= occurrence
< end`) and end exactly one calendar month after start in UTC, using the existing
lifecycle rule. Occurrence time, checkout time, current time and canonical
creation time never supply period boundaries. Calendar-month validity is checked;
the bootstrap does not extend an expired period to make an operation eligible.

The RPC changes only the two period columns on each row (plus the existing
canonical updated-at trigger) and inserts the immutable bootstrap record.
Provider timestamps, identity, plan, status, payment, checkout, trial history,
seat approval and operation rows are preserved. The record is the durable audit
of the change; no duplicate payment or billing operation is created.

## Guard and invocation boundary

The proof table has RLS, no application-role table privileges, unique authority
references, and insert-validation/update/delete/truncate guards. Helpers have
no browser or service EXECUTE grant. Only the UUID bootstrap RPC is granted to
`service_role`, with a trusted owner, actor check and fixed search path.

Deferred constraint triggers verify that an initial-proof subscription's final
canonical/shadow period pair is null or exactly backed by its bootstrap record.
The verifier uses a private fixed-path SECURITY DEFINER context because deferred
checks can run after the caller has returned to service-role privileges. It
grants no table access. Existing lifecycle, plan, seat and cross-provider guards
remain responsible for subsequent authority transitions. The bootstrap uses
the repository's READ COMMITTED/account-lock protocol and deferred constraints.

New initial activations call the bootstrap after payment, canonical linkage and
checkout completion, inside the same transaction. Missing explicit periods
preserve the existing null-date behavior; invalid explicit periods roll back
the activation. Processed initial retries retain their previous behavior.

After separate review, deployment and recovery authorization, an operator can
enable the reconciliation policy for a bounded window, call the UUID bootstrap
RPC for Purchase #3 once, verify the proof and both period pairs, and restore
the policy. This document authorizes none of those remote actions. The migration
alone creates no bootstrap records and changes no existing subscriptions.

## Local verification

Permanent pgTAP coverage is in `paddle_initial_period_bootstrap.sql`, using only
synthetic observations. It covers automatic/trial/historical success, full-row
idempotency, preserved evidence/payment/checkout, period and provenance failures,
later-authority exclusion, role ACLs, direct DML, seat/plan eligibility and
rollback at each write boundary. Existing lifecycle, plan, seat and initial
purchase suites remain required regressions.

`scripts/test-paddle-initial-period-concurrency.py` uses observed lock waits for
duplicate bootstrap, lifecycle contention in both orders and concurrent initial
dispatch. `scripts/test-paddle-initial-period-migration.py` upgrades a populated
179-migration disposable database, compares every existing public row and ACL,
checks initial-proof function compatibility and advisor findings, and finally
reconstructs the local database. Neither script accepts a remote URL.

### CODEX-41 verification result

Status: **BLOCKED — FULL_UNIT_SUITE_NOT_GREEN**. Implementation is local and
uncommitted; no remote recovery or deployment was attempted.

| Check                                   | Result                                                                                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused SQL                             | 114 assertions passed                                                                                                                         |
| Full database                           | 32 files, 3,100 assertions passed                                                                                                             |
| Concurrency                             | 99 cases passed, zero deadlocks: bootstrap 6, automatic initial 31, initial reconciliation 8, lifecycle 10, plan 8, seats 15, cross-ledger 21 |
| Normal full unit command                | 292 files passed, 1 failed; 3,390 tests passed, 1 timed out                                                                                   |
| Full unit command with `--maxWorkers=1` | 293 files, 3,391 tests passed                                                                                                                 |
| Lint / formatting                       | Passed; ESLint has three existing warnings and zero errors                                                                                    |
| Reconstruction                          | All 180 migrations applied; prior 179 hashes unchanged                                                                                        |
| Populated upgrade                       | Every existing public row unchanged, existing ACLs/RLS unchanged, no bootstrap records created                                                |
| DB lint / advisors                      | No lint errors; 50 existing warning findings, zero new findings                                                                               |
| Diff whitespace                         | Passed, including new files                                                                                                                   |
| Build / Deno                            | Not applicable; no frontend or Edge/shared TypeScript changed                                                                                 |

The normal unit run fails the existing Windows ACL test `rejects broad permissions`
at `tests/unit/paddle-catalogue-preflight.test.ts:183`: 7,820 ms against its unchanged
5,000 ms timeout. It invokes PowerShell to change a synthetic fixture's ACL and
then verifies rejection by the private-binding reader. The test and reader are
unchanged. The single-worker pass does not clear the normal-runner gate; no
assertions, timeouts or committed worker settings were weakened.

Independent review should cover the separate proof authority, deferred pair
guards, READ COMMITTED lock ordering and automatic activation rollback. The
normal unit gate must be resolved before declaring local readiness. Staging
deployment and Purchase #3 recovery still need separate authorization.

### CODEX-44 stale-veto correction

Status: **BLOCKED � FULL_UNIT_SUITE_NOT_GREEN; NOT_READY for re-review**.
The billing regression is corrected locally, but the required normal full unit
run did not pass. No commit, push, PR, deployment, staging access, provider call,
webhook replay or production access occurred.

The old predicate rejected every retained `subscription.updated` with
`updatedAt`. The correction excludes known `stale` observations and, for linked
subscriptions whose ingress keeps old updates `correlated`, requires both
retained clocks to precede the stored provider revision before excluding that
row. Pending/manual-review, equal-time and newer observations still block;
disagreeing clocks also block. Existing proof validation and locks are unchanged.
The migration is still number 180 and is edited in place.

Rollback-only differential reproduction confirmed both CODEX-43 failures with
the old predicate, then confirmed historical recovery and missing-period
activation with the fixed predicate. A newer correlated observation still
raised `PADDLE_INITIAL_PERIOD_SUPERSEDED`.

| Verification                                | CODEX-44 result                                                                                                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused bootstrap SQL                       | 174 assertions passed, including all original 114 and 60 new checks                                                                                                          |
| Required new cases                          | Historical stale, missing-period stale activation, no authority from stale, newer correlated, pending, manual-review, equal-time contradiction and mixed observations passed |
| Full database                               | 32 files / 3,160 assertions passed; initial purchase, trial conversion, lifecycle, plan and seat regressions included                                                        |
| Concurrency                                 | 99 passed / zero deadlocks: bootstrap 6, automatic initial 31, initial 8, lifecycle 10, plan 8, seats 15, cross-ledger 21                                                    |
| Populated upgrade                           | Existing public rows, ACLs/RLS and historical evidence compatibility unchanged; no automatic bootstrap records                                                               |
| Reconstruction                              | 180 migrations; prior 179 migration files and manifest hashes unchanged                                                                                                      |
| DB lint / security and performance advisors | No lint errors; same 50 existing warning findings, zero new findings                                                                                                         |
| Normal `npm run test:unit`                  | 291 files passed / 2 failed; 3,389 tests passed / 2 timed out; 64.65 seconds; no worker or timeout overrides                                                                 |
| Timeout diagnostic                          | Both failing files passed separately: 102 tests in 1.51 seconds; this does not clear the normal full-suite gate                                                              |
| Lint / format / whitespace                  | Passed; three existing ESLint warnings, zero errors                                                                                                                          |

The normal runner timed out unchanged source-file scans at
`tests/unit/client-icon-library-wiring.test.ts:17` (5,990 ms) and
`tests/unit/paddle-catalogue.test.ts:141` (5,448 ms), each against 5,000 ms.
No tests, timeout settings or worker settings were weakened. The exact cause of
the full-run timing variance remains unresolved; the isolated pass is diagnostic
only. A green normal full unit run is still required before the success verdict.

Exactly eight release files remain. CODEX-44 changed five: migration 180, the
focused SQL suite, its fixture, the migration hash in
`config/staging-commercial-certification.json`, and this document. Both
concurrency/migration scripts and the deployment-manifest document retain their
pre-fix bytes. Pre-fix SHA256 fingerprints were saved outside the release tree
before editing.

### CODEX-47 missing-timestamp correction

Status: **PADDLE_INITIAL_PERIOD_MISSING_TIMESTAMP_VETO_FIXED**.
Recommendation: **READY_FOR_RE_REVIEW**. These results supersede the older local
verification status above; they do not authorize packaging or deployment.

The CODEX-46 finding was caused by the outer `updatedAt` presence filter. It
removed incomplete non-stale updates from the veto set before the strict-old
exception could evaluate them. Migration 180 now evaluates every relevant
non-stale update and exempts only correlated rows with both timestamp strings
present and both authenticated instants strictly older than the stored provider
revision. `CASE` keeps missing values out of the timestamp parser and defaults
them to blocking. No replacement date or arrival-order heuristic is used.

Previous predicate:

```sql
and po.observation->>'kind'='subscription.updated' and po.observation ? 'updatedAt'
and po.disposition<>'stale'
and not coalesce(po.disposition='correlated'
and public.billing_paddle_timestamp_v1(po.observation->'updatedAt')<s.provider_updated_at
and public.billing_paddle_timestamp_v1(po.observation->'occurredAt')<s.provider_updated_at,false)
```

Corrected predicate:

```sql
and po.observation->>'kind'='subscription.updated'
and po.disposition<>'stale'
and not case when po.disposition='correlated'
and jsonb_typeof(po.observation->'updatedAt')='string'
and jsonb_typeof(po.observation->'occurredAt')='string'
then coalesce(public.billing_paddle_timestamp_v1(po.observation->'updatedAt')<s.provider_updated_at
and public.billing_paddle_timestamp_v1(po.observation->'occurredAt')<s.provider_updated_at,false)
else false end
```

The retained observation table remains immutable and unavailable for browser or
service-role DML. Trusted ingress authenticates the observation projection,
requires `occurredAt`, and validates `updatedAt` when present. An omitted
`occurredAt` fails with `BILLING_PROOF_INVALID` before retention; null `updatedAt`
fails with `PADDLE_LIFECYCLE_TIMESTAMP`. The normalizer and ingress are unchanged.
Known stale classification continues to come from trusted ingress. Stale rows
grant no authority, even when optional lifecycle facts are absent.

The full relevant set is checked: one harmless observation cannot hide another
unsafe observation. Only the exact authenticated `transaction.completed`
already consumed by the initial-purchase payment can supply period bounds.
Payment authority, canonical status, provider revision, and lock order are
unchanged. The migration still performs no backfill, changes no existing billing
rows, enables no flags, and calls no provider.

| Permanent regression case                                              | Result                                                                                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Newer correlated cancellation without `updatedAt`                      | `PADDLE_INITIAL_PERIOD_SUPERSEDED`; complete billing snapshot unchanged                                                         |
| Correlated active update without `updatedAt`                           | Same veto and no writes; no cancellation special case                                                                           |
| Correlated old update without `updatedAt`                              | Veto; an old occurrence alone is insufficient                                                                                   |
| Missing `occurredAt`                                                   | Authenticated ingress rejects before retention; no billing writes                                                               |
| Both clocks complete and strictly old                                  | Historical bootstrap applies from the consumed initial transaction                                                              |
| Either clock old, the other equal/newer                                | Veto in both directions                                                                                                         |
| Equal instants spelled with different RFC3339 offsets/precision        | Veto by semantic timestamp comparison                                                                                           |
| Legitimately stale row missing optional lifecycle facts                | Harmless, retained unchanged, no authority                                                                                      |
| Stale plus incomplete non-stale row                                    | Veto; complete billing snapshot unchanged                                                                                       |
| Stale plus complete strictly old correlated row                        | Historical bootstrap applies                                                                                                    |
| New purchase, no initial period, harmless stale history                | Activation `applied`; bootstrap `not_available`; both period pairs NULL                                                         |
| New purchase, incomplete non-stale update, with/without initial period | Exact supersession error; shadow, checkout and existing audit history unchanged; no canonical/payment/evidence/bootstrap writes |
| Historical recovery with incomplete non-stale state                    | Rejects without writes                                                                                                          |

All prior stale, pending, manual-review, equal-time contradiction, newer and mixed
set checks remain in the permanent SQL suite. Two rollback-only differential
reproductions also reran the original CODEX-43 failures against the old predicate
and confirmed the corrected historical and missing-period activation behavior.
The CODEX-46 probe now rejects the missing-timestamp cancellation, alongside the
present-timestamp cancellation; offset/precision boundaries and observation
immutability/ACL checks also passed.

| Verification                     | CODEX-47 result                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch                           | `codex/paddle-initial-period-bootstrap`                                                                                                            |
| HEAD, main and origin/main       | All remain `ecfb17dc2f72c7b19e79791bfbe5639e3df44321`                                                                                              |
| Eight-file inventory             | Preserved; starting and ending SHA-256 fingerprints recorded outside the release tree                                                              |
| Focused SQL                      | 231 assertions passed: all prior 174 plus 57 new checks                                                                                            |
| Prior review reproductions       | Both original stale regressions reproduced under the old predicate and passed under the correction                                                 |
| CODEX-46 missing-timestamp probe | Supersession veto; no period/payment/evidence/provider-clock writes; 20 probe results checked                                                      |
| Full DB                          | 32 files / 3,217 assertions passed, including initial purchase, trial-to-paid, lifecycle, plan and seat regressions                                |
| Legacy seat fixture              | Passed unchanged in this normal full run; the prior baseline-reproduced timing failure was not encountered or modified                             |
| Concurrency                      | 102 cases passed, zero deadlocks: bootstrap 6, automatic initial 31, initial 8, lifecycle 10, plan 8, seats 15, cross-ledger 21, ordering probes 3 |
| Normal full units                | 293 files / 3,391 tests passed in 71.69 seconds; no timeout or worker overrides                                                                    |
| Reconstruction                   | All 180 migrations applied; prior 179 migration files and manifest entries/hashes unchanged                                                        |
| Populated upgrade                | All existing public rows and table ACLs/RLS unchanged; historical evidence compatible; no backfill or bootstrap records                            |
| DB lint                          | No errors                                                                                                                                          |
| Security/performance advisors    | Same 50 existing warnings as migration 179; zero new findings                                                                                      |
| ESLint                           | No errors; three unchanged warnings                                                                                                                |
| Format and whitespace            | Passed, including checks of untracked release files                                                                                                |
| Final local database readback    | 180 migrations, zero users, zero bootstrap records, sales and reconciliation disabled                                                              |

CODEX-47 modifies four of the eight release paths: migration 180, the focused
bootstrap SQL suite, its migration hash in the certification JSON, and this
document. The fixture, both Python verification scripts, and deployment-manifest
document retain their starting bytes. The exact release inventory remains:

1. `supabase/migrations/20260928072848_paddle_initial_period_bootstrap.sql`
2. `supabase/tests/paddle_initial_period_bootstrap.sql`
3. `supabase/tests/fixtures/paddle_initial_period_fixture.psql`
4. `scripts/test-paddle-initial-period-concurrency.py`
5. `scripts/test-paddle-initial-period-migration.py`
6. `config/staging-commercial-certification.json`
7. `docs/staging-commercial-deployment-manifest.md`
8. `docs/paddle-initial-period-bootstrap.md`

Stale behavior preserved: **YES**. Consumed initial transaction authority
unchanged: **YES**. Lock ordering unchanged: **YES**. Remaining risks are the
previously observed machine/fixture timing variability and pending independent
re-review; neither produced a failing final gate in this run. The initial
focused run exposed an incorrect zero-audit assumption in the new tests because
checkout creation already emits an audit row. The new assertion now requires
exact preservation of that preexisting audit history; all production veto checks
passed in that first run as well.

Staging reads/writes, Paddle calls, webhook replays, deployments, production
access, commits, pushes and PRs: **0 each**. No packaging was performed. Work
stops at local implementation and verification.
