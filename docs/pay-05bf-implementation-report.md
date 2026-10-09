# PAY-05BF implementation handoff

Task: `PAY-05BF-FOUNDER-STAGING-GOVERNANCE-IMPLEMENTATION`.
Candidate is local and uncommitted. This report is not operational approval.

## 1. Source identity

Repository: `elkasaby1996-sys/coachos`.
Verified clean starting checkout, detached at
`80bc0c7710694855a2f7551d8c6cd013c2f16c6f`, tree
`c0b073e89642048e889cf1022183250cbf9a098a`.
No fetch, merge, rebase, commit, push or PR was performed. HEAD remains unchanged;
the implementation is a working-tree candidate, not a new reviewed execution SHA.
Future operational evidence must bind the final separately reviewed source identity.

Required sources reviewed: the supplied RepSync Operating Standard and Model
Selection V.2, PAY-05BE design and PAY-05BD handoff, the four existing staging
documents, and the current validators, adapters, runners, workflows and tests.

## 2. Exact changed files

| File                                                  | Reason                                                                                                                                                                                 |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config/staging-founder-governance.json`              | New strict, disabled source policy with exact isolated scope and no enrolled identities, keys or validity window.                                                                      |
| `scripts/staging-founder-governance.mjs`              | New verification-only governance, domain-separated Ed25519, authenticated identity/scope, workflow/action, migration approval and trusted replay interfaces.                           |
| `scripts/staging-bootstrap-baseline.mjs`              | Explicit founder baseline v3 and unsigned candidate, truthful same-human history review, signed acceptance and source-policy binding; legacy v2 retained.                              |
| `scripts/staging-bootstrap-contracts.mjs`             | Forward founder policy to baseline validation and conservatively bound inner authorization to signed baseline authority.                                                               |
| `scripts/staging-bootstrap-capture.mjs`               | Require separate scoped capture action before transport, recheck boundaries, return unsigned founder candidate without automatic approval.                                             |
| `scripts/staging-bootstrap-delivery.mjs`              | Founder descriptor v2, action claim before transport and handoff of the claimed operation; retain private filesystem protections.                                                      |
| `scripts/staging-bootstrap-observation.mjs`           | Require founder baseline and trusted action checks at read boundaries.                                                                                                                 |
| `scripts/staging-bootstrap-runner.mjs`                | Founder action/replay checks before capabilities and mutations; validate reused delivery claims against the runner's own mode; include baseline admission deadlines.                   |
| `scripts/staging-bootstrap.mjs`                       | Explicit protected workflow mode, disarmed-policy check and actual workflow metadata/action validation before credentials or remote adapters.                                          |
| `scripts/staging-release-observation.mjs`             | Trusted founder action checks on remote adapter boundaries, with no absent-hook fallback.                                                                                              |
| `scripts/staging-release-runner.mjs`                  | Signed per-phase/mode founder action, context checks, replay claim and revalidation throughout existing release gates.                                                                 |
| `scripts/staging-release.mjs`                         | Explicit workflow mode, disabled-policy denial and workflow/action verification before remote capability creation.                                                                     |
| `scripts/staging-timing-evidence.mjs`                 | Explicit founder receipt v3 with execution tree, governance policy and observer source binding; legacy receipt v2 unchanged.                                                           |
| `scripts/staging-timing-admission.mjs`                | Founder admission v3 and action binding; conservative bootstrap baseline freshness/expiry deadline correction, retaining existing allowances.                                          |
| `.github/workflows/supabase-staging-bootstrap.yml`    | Explicit founder mode and protected action input; require full unit tests before capability use.                                                                                       |
| `.github/workflows/supabase-deploy-staging.yml`       | Explicit founder mode/action input and exact sanitized plan artifact allowlist.                                                                                                        |
| `tests/helpers/staging-founder-fixture.ts`            | Disposable synthetic authenticated fixtures, ephemeral in-memory evidence/action keys and trusted test-only approval/claim callbacks.                                                  |
| `tests/unit/staging-founder-governance.test.ts`       | Focused 67-case founder contract, tampering, authority, replay, technical-gate, positive progression and denial coverage.                                                              |
| `tests/unit/staging-bootstrap-capture.test.ts`        | Positive bounded founder capture returning an unsigned candidate.                                                                                                                      |
| `tests/unit/staging-bootstrap-delivery.test.ts`       | Positive founder descriptor delivery/cleanup and legacy-version rejection.                                                                                                             |
| `tests/unit/staging-bootstrap.test.ts`                | Assert protected workflow founder mode/action and full unit-test gate; apply the existing 15-second harness timeout to six filesystem-heavy legacy cases.                              |
| `tests/unit/staging-release.test.ts`                  | Positive founder phase progression with unchanged technical gates, followed by replay denial; raise two fixture-suite harness timeouts to 60 seconds without changing security clocks. |
| `tests/unit/staging-commercial-certification.test.ts` | Assert protected action input and sanitized artifact paths.                                                                                                                            |
| `tests/unit/staging-commercial-preflight.test.ts`     | Update exact workflow environment/artifact expectations for the explicitly selected founder mode.                                                                                      |
| `docs/staging-founder-governance.md`                  | Document the complete contracts, truthful acceptance, ordering, key custody/revocation, trusted integrations and operational blockers.                                                 |
| `docs/staging-fresh-bootstrap.md`                     | Distinguish founder mode from the preserved independent baseline procedure.                                                                                                            |
| `docs/staging-release-phases.md`                      | Link founder per-operation governance and preserved release contracts.                                                                                                                 |
| `docs/staging-commercial-certification.md`            | Explain disabled founder integration without changing certification requirements/statuses.                                                                                             |
| `docs/paddle-only-certification.md`                   | Link founder scope and preserve Paddle-only certification requirements.                                                                                                                |
| `docs/pay-05bf-implementation-report.md`              | Record this implementation and verification handoff.                                                                                                                                   |

No dependency manifest/lock, source application, Supabase function, migration,
production workflow/script, target registry, scenario catalogue, SQL extraction
module or CI classification policy was changed.

## 3. Implemented governance contract

Mode: `founder_owned_synthetic_staging_v1`. Exact scope is project
`exmrksgdikfprtfeltzu`, organization `aerjnyzewgglcpkbrxyn`, origin
`https://repsync-staging-replacement.netlify.app`, repository
`elkasaby1996-sys/coachos`, environment `supabase-staging`, sandbox Paddle and
synthetic-only data. Numeric repository and authenticated founder identities
require later source-reviewed enrollment. The same authenticated founder is
operator and approver, explicitly `independentOfOperator: false`, `sameHuman: true`.

Every signed governance block binds policy digest, exact acceptance statement and
version, authenticated identity evidence, provenance/history hashes and limitations,
execution SHA/tree, scope and expiry. Acceptance never waives historical completeness,
unknown/contradictory history, import/restore, customization, customer-state,
writer/ingress, catalog/managed data, SQL, role, RLS or ACL gates.

Founder versions: baseline v3, measurement receipt/admission v3, delivery descriptor
v2 and action v1. Complete measurement receipts remain observations, not standalone
authority; the signed timing admission reviews three distinct complete samples.
Inner bootstrap authorization stays v2 and staging release authorization stays v3.
Strict explicit version selection rejects unknown fields and mode/version confusion.

## 4. Signing and key-purpose separation

Verification uses Ed25519 with distinct baseline, timing and action domain strings.
Enrollment binds SPKI fingerprint, owner, authority class, explicit purpose/phase,
exact scope, validity and revocation. Evidence keys cannot authorize actions;
action keys cannot approve baseline/timing evidence. Legacy keys/signatures cannot
satisfy founder validation or vice versa. The legacy review key list remains empty.

No operational signing code, private key, signer fallback or environment key override
was added. Only synthetic test helpers generate ephemeral in-memory keys/signatures.
Ordering is signed baseline, complete observations, inner authorization, signed
action, then signed timing admission bound to that action; there is no circular
signature dependency. Capture uses a separate read-only action and never signs or
approves its output.

## 5. Runner and workflow guarantees

Remote-capable founder paths require a valid action before transport/capability use.
Actions bind phase, preflight/apply mode, exact inner authorization digest, workflow
name/path/main ref, numeric repository/actor, run ID/attempt, SHA/tree, nonce, expiry,
workflow evidence and separate ordered-migration/checkpoint/backup/recovery approval.
Preflight cannot authorize apply, including through a reused private-delivery claim.
Mutation boundaries recheck authority; expired/revoked authority also prevents
failure-path remote inventory collection. Existing source, target, history,
observation, dry-run, migration and checkpoint validations remain mandatory.

Actual environment approval/no bypass/protected main/required checks require a fresh,
authenticated trusted workflow-proof callback whose digest matches the signed action.
Replay prevention requires a trusted durable atomic claim for nonce and operation slot
`repository/environment/run/attempt/phase/mode`; a failed consumed action cannot be
automatically retried or resumed. These operational callbacks are intentionally
unconfigured: the CLIs block even after hypothetical key enrollment.

Workflows retain main/manual-dispatch, protected environment references, serialized
concurrency, no cancellation and their original 45-minute clock. YAML does not prove
actual hosted protection. Artifacts allow only sanitized `release-evidence.json`,
not the private baseline directory.

## 6. Legacy and production non-regression

Legacy strict independent contracts and identity separation remain distinct and
supported by validators/runners. The protected staging workflows deliberately
select the new disabled mode; they do not claim operational readiness or silently
fall back to legacy approval. Production and archived staging remain denied; no
founder authority can promote to production or live Paddle.

No billing implementation, webhook verification/reconciliation, subscriptions,
entitlements, checkout, production deployment, role/RLS/ACL or read-only SQL logic
was changed. All 31 remote certification scenarios remain `not_run`.

The baseline deadline omission was confirmed in the conservative timing estimate.
Real bootstrap execution now additionally reserves capture start plus 15 minutes,
baseline expiry and founder baseline authority expiry. This only shortens the
admissible window. The 60-second observation, 15-minute freshness, 30-minute
authorization maximum, 45-minute workflow budget, three complete samples, existing
operation allowances and 25% margin are unchanged.

## 7. Commands and actual results

The broad relevant local regression command was:

```powershell
npx vitest run tests/unit/staging-founder-governance.test.ts tests/unit/staging-bootstrap-capture.test.ts tests/unit/staging-bootstrap-delivery.test.ts tests/unit/staging-bootstrap.test.ts tests/unit/staging-release.test.ts tests/unit/staging-bootstrap-baseline.test.ts tests/unit/staging-timing-admission.test.ts tests/unit/billing-retirement-deployment.test.ts tests/unit/staging-bootstrap-artifacts.test.ts tests/unit/staging-bootstrap-baseline-file.test.ts tests/unit/staging-replacement-target.test.ts --no-file-parallelism --reporter=json --outputFile=output/staging-release/pay-05bf-focused-tests.json
```

Actual result: 11 files, 977 tests, 964 passed and 13 failed. Founder tests passed
67/67; baseline 120/120; capture 59/59; timing 28/28; replacement target 72/72;
billing deployment 44/44; frozen artifacts 8/8; baseline file protections 8/8.
Delivery passed 33/34: the remaining test fails during fixture `symlinkSync` with
Windows `EPERM`, before reaching the validator. An independent disposable file
symlink probe also returned `EPERM`; the test and protections were not weakened.
Diagnostic rerun of the six bootstrap and six release cases with a 120-second CLI
default passed all six bootstrap cases. Readable diagnostics confirmed the six
release failures were their explicit inherited 20/30-second harness timeouts, which
the CLI default cannot override. Those two suite limits are now 60 seconds; the six
bootstrap cases now use the neighboring cases' existing 15-second harness timeout.
All assertions and synthetic security clocks are unchanged. The final targeted
rerun is recorded below. This is not an all-units pass.

Final targeted rerun after the harness-only adjustment:

```powershell
npx vitest run tests/unit/staging-bootstrap.test.ts tests/unit/staging-release.test.ts --no-file-parallelism -t 're-observes after dry-run|does not claim success from CLI|blocks changed checkpoint|late mutation return|runs containment then verified|supports newly authorized resume from 18[456]|protects the distinct final nonbilling|completes a stable cutover'
```

Actual result: **12/12 passed**, two files, 525 unrelated cases excluded by the
explicit name filter, duration 231.34 seconds. Thus the 12 broad-run timeout failures
were resolved and verified without changing assertions or runtime security limits.
Across the broad and certification runs plus this rerun, 1097 distinct relevant
cases passed; the one Windows symlink fixture remains unresolved. These are
combined runs, not a claim that a fresh all-units command passed. Linux verification
of the unchanged symlink test and Docker-backed database checks remain required.

Additional completed checks:

| Command/check                                                                                                                              | Actual result                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npx vitest run tests/unit/staging-commercial-preflight.test.ts tests/unit/staging-commercial-certification.test.ts --no-file-parallelism` | 121/121 passed across two files.                                                                                                                                                           |
| Targeted new founder retrospective/revocation/baseline-expiry/preflight-claim cases                                                        | 4/4 passed; final broad run also included all 67 founder cases.                                                                                                                            |
| `npm run lint`                                                                                                                             | Passed, zero errors; three existing React refresh/hooks warnings.                                                                                                                          |
| `npm run format`                                                                                                                           | Passed before this report was added; final formatting validation recorded below.                                                                                                           |
| `npm run build` (`tsc -b && vite build`)                                                                                                   | Passed, TypeScript and 2325 Vite modules. Initially missing installed `@paddle/paddle-js`; restored only pinned 1.6.5 from public npm, checked lockfile SHA-512, changed no manifest/lock. |
| `node scripts/billing-edge-typecheck.mjs`, with `BILLING_DENO_BINARY` set to cached Deno 2.9.6 and `BILLING_DENO_OFFLINE=1`                | Passed 14 billing/tombstone Edge Functions with cached-only resolution. Default Windows `npx.cmd` launcher failed; direct cached binary resolved the local launcher limitation.            |
| `node scripts/staging-commercial-plan.mjs --validate`                                                                                      | `valid: true`.                                                                                                                                                                             |
| `node scripts/validate-billing-retirement.mjs`                                                                                             | Valid: 186 migrations, 14 billing functions, three tombstones, zero active legacy-provider runtime.                                                                                        |
| `node .github/scripts/ci-change-scope.test.mjs`                                                                                            | 832/832 passed. Classifier policy unchanged; not proof of actual hosted CI results.                                                                                                        |
| Release identity/frozen bootstrap digest checks                                                                                            | Passed; values below unchanged.                                                                                                                                                            |
| Protected source and production/registry `git diff --quiet` checks                                                                         | Passed.                                                                                                                                                                                    |
| `git diff --check`                                                                                                                         | Passed before this report; final validation recorded below.                                                                                                                                |
| Docker availability (`docker info --format '{{.ServerVersion}}'`)                                                                          | Unavailable: Docker Desktop Linux engine pipe absent. No pgTAP/cold-install rehearsal/database execution was run.                                                                          |

Initial sandbox test execution could not rename Vitest cache files; local-only tests
were rerun with approved escalation. Two early diagnostic runs were interrupted
before completion and are not counted as successful regression runs. No runtime
security deadline was extended to accommodate local testing.

## 8. Protected source and migration integrity

Protected file count remains 740; canonical migrations remain 186.
Release payload digest remains
`18910a76eb541d3958c0009d6fddc5bf4eba0b1991bb2b9e393c6777e748af2c`.
Frozen bootstrap artifact digest remains
`92e69114847c184f19244ca59d1da39fc23ae00ca0bfc034269042519e18f24c`.

Protected source matched the frozen reviewed baseline via
`git diff --quiet 9a9f79ff2ba7aada9ff2c24f162360d9c03b33a0 -- src supabase/functions supabase/migrations supabase/config.toml`.
Legacy review/target/scenario registries and production script/workflow matched HEAD.

## 9. Remaining external operational dependencies

Operational use remains blocked by disabled policy, empty enrollment and absent
trusted approval/replay/private-delivery integrations. Before any separate operation:
authenticate founder/numeric repository enrollment, purpose-scoped key custody and
expiry/revocation; verify actual protected main, required CI and environment approval
with no administrative bypass; establish durable atomic replay and independently
retained private audit evidence; pass full blocking Linux/CI/database regressions;
complete fresh historical/current technical evidence and actual backup/restore proof;
arrange scoped credential delivery/rotation/revocation and operator go/no-go.

CI classification remains unchanged. New governance files are not silently added to
the old narrow tooling exemption; any additional configured-data CI requirement must
be satisfied, not bypassed. A YAML environment reference or local classifier tests
are not verification of GitHub settings or check success.

The 31 actual hosted Paddle certification scenarios, later synthetic-account creation
and billing/reconciliation monitoring remain separately authorized and unverified.
Enabled founder policy must expire and be retired/reassessed before wider customer
onboarding, real data, a new project or changed scope. Approval expiry does not revoke
persistent database credentials or an older checked-out policy; credential revocation
and cancellation are operational requirements, not claims made by this code.

## 10. Architecture conflicts and concerns

No technical release predicate was removed to permit truthful same-human approval.
Legacy independent mode is retained, not relabeled as founder review. Same-human
approval remains an explicit risk concession confined to synthetic staging;
cryptography and Astra review cannot provide independent human approval or prove
absence of undisclosed historical changes later restored.

Trusted provider implementations were not fabricated from signed assertions or
caller booleans. Missing integrations intentionally prevent hosted operation and
need separate review before they can confer authority. Platform test gaps and any
remaining regression failures must stay visible; local checks are not certification.

## 11. Zero remote mutations

Zero hosted Supabase queries/mutations, workflow dispatches, Netlify changes,
Paddle operations, credential reads/changes, operational signatures, enrollment,
database migrations or production access. No AWS/S3/KMS/private-storage provisioning.
No commit, push, PR or merge. The only external download was the already pinned
public npm dependency required to restore the local build installation.

## 12. Next action and verdict

Exactly one next action: independent Astra High review of the uncommitted candidate.

Verdict: **READY_FOR_INDEPENDENT_REVIEW**, with the explicit platform/database
verification gaps above. This verdict means code-review readiness, not operational
approval, certified staging or production readiness. Operational use remains blocked.

Final source/protected digest checks, 31 `not_run` scenario check, JavaScript syntax
checks and lint passed after the test harness adjustment. Final formatting and
working-tree whitespace checks are completed as the last handoff validation.

`CODEX_PAY_05BF_FOUNDER_GOVERNANCE_IMPLEMENTATION`
