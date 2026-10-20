# RepSync CI/CD simplification — implementation and document sync plan

**Decision:** [ADR-2026-10-20](adr-2026-10-20-ci-cd-simplification.md).  
**Status:** Planning/implementation work authorized by founder on 20 October 2026. No remote deployment, release relaxation or certification approved.  
**Tracked repository baseline:** `main` `9089060489295c7ce36d6798c283a2ad9d2141bf`. Local 63-file billing candidate is uncommitted and protected.

## Existing versus delta

**Existing:** GitHub `quality` + `smoke-e2e` jobs with Node 22, `npm ci`, unit/lint/format/build, local Supabase and Playwright; protected main; manual staging and production workflows. Existing billing SQL/RLS/concurrency results and source-reviewed adapters remain reusable evidence.

**Delta:** Prove existing CI can run candidate source with exact dependency/provenance evidence; add the smallest billing checkout browser tests and owned disposable fixture pathway; map/close release-governance gaps; document the first approved synthetic staging deployment. **Do not rebuild test orchestration or the product.**

## Workstreams

| Owner | Scope | Outputs | Do not touch |
| --- | --- | --- | --- |
| Agent 1 — CI | Existing `.github/workflows/ci.yml`, pinned dependency/build/test qualification, candidate checkout/provenance | minimal CI changes, failing/gating checks, artifacts | release workflows, billing source/DB, live credentials |
| Agent 2 — Release | staging workflow + governance source audit; parity assessment and disarmed implementation plan | smallest admissible plan, explicit unsatisfied requirements, safe no-dispatch defaults | production workflow, remote staging, database/checkout tests |
| Agent 3 — Browser | checkout Playwright specs/fixtures over existing CI disposable Supabase; SDK mock and network denial | real assertions for reopen/server-owned state/entitlements, no privacy leak | release workflows and custom native supervisor |
| Agent 4 — Independent controls/docs | reconcile ADR, launch and governance documents; independent threat/control review and verification evidence table | control matrix deltas, precise documentation PR, gaps requiring founder decision | all runtime/payment source; no deployments |

Use **separate isolated worktrees/branches**, never the primary local 63-file working tree. Agent 4 reviews independently, not an alternative release approver. At integration, one owner resolves overlapping edits; parallel work is not permission to merge.

## Stage 0 — protect evidence and stop redundant construction

- Record hashes of the 63-file candidate before any operation. Do not stage, stash, clean, reset, commit or merge it without a separately reviewed recovery/integration plan.
- Preserve accepted PAY-NATIVE-PROBE-03 source and unexecuted parent proposal; do not automatically continue a custom compiler supervisor now that existing CI is being evaluated.
- Preserve accepted GitHub governance adapter and the pending 186→188 source-review artifacts.
- Preserve original browser harness and findings; do not run its currently unsafe Docker/cleanup path.
- Recheck potential wildcard-exposed protected `/pg/query` service with a separate **read-only containment assessment**; obtain explicit authorization before changing the protected service.

## Stage 1 — verify the existing CI runner and source provenance

- Establish pinned Node 22 version and Node/npm/lockfile verification on hosted runner.
- Inspect existing GitHub Actions permissions, runner image, caches, jobs, dependencies, check and log provenance. Evaluate source checkout at the reviewed commit.
- Run only in safe PR-owned CI where test secrets are appropriately scoped and no remote deployment side effects are possible.
- Produce `quality` and `smoke-e2e` evidence; failures stay failures, not skips.
- No native Windows launcher qualification requirement should be silently mapped onto Linux CI. Instead record which Windows-only risk is no longer on the execution path and which supply-chain/runner risks are newly accepted.

## Stage 2 — billing E2E on the existing CI disposable stack

- Inspect and reuse the current `supabase start` and smoke fixtures; prevent `/pg/query` and other privileged unauthenticated query services.
- Reconstruct exact migrations and test only synthetic Auth/data isolated by runner, with cleanup.
- Use the production Paddle URL validator unchanged; mocked SDK must not navigate to/provider transact. Verify checkout creation once, reopen, server refresh correlation, unchanged canonical feature/seat entitlements, no storage leakage, full network intercept through teardown.
- Remove sensitive Playwright auto artifacts by fail-closed redaction/retention policy; prove sanitization.
- Do not assert success without hosted Playwright results and teardown evidence.

## Stage 3 — release governance equivalence (no operational activation)

- Inspect main-only staging workflow, existing environment approval, exact artifact/candidate SHA and current protected checks.
- For each previously locked control, supply replacement implementation and observable proof, or explicitly retain it as blocking. Focus on exact-run/attempt approval and no-bypass, durable replay/custody, credential confinement, fencing, recovery checkpoint 187/188 and migration source identity.
- Do not use a manual founder checkbox, CI actor, status name or source-only test as proof of controls.
- Preserve disabled Paddle live operations and synthetic-only scope. Any policy relaxation requires a separate named founder risk decision; code or docs must not infer it.
- Plan an immutable billing commit separately from this local dirty tree, then apply an authorized synthetic staging sequence only after all gates qualify.

## Stage 4 — certify and release

- Execute controlled Paddle sandbox scenarios, including negative and seat-change/downgrade/idempotency paths; compare canonical DB with provider state.
- Verify Netlify/Supabase deployment source/artifact parity; test backup/restore, alerting, rollback/forward repair.
- Production remains no-go until independent final review and explicit founder authorization.

## Definition of done

A simplification is complete only when:
1. CI checks are reproducible on the exact reviewed candidate; no hidden skipped essential tests.
2. Existing security invariant coverage is preserved or replaced with independently demonstrated equivalent coverage.
3. Staging release authority remains fail-closed until a separately approved and operated replacement is accepted.
4. Local/protected and production resources show no unauthorized mutations.
5. Project documents (ADR, control matrix, release phases, governance, go/no-go, launch dashboard/Project sources) have been reconciled, with an explicit link to the implementation PR and accurate status.

## Project-source sync boundary

This GitHub documentation PR is the proposed canonical repository record. **It does not automatically edit the distinct ChatGPT Project Source uploads or Launch Atlas/Sites dashboard.** Update those surfaces only via their authorized editing mechanism after review, retaining the original Project operating/model-routing standards and attaching a reference or amendment. Do not represent them as already synchronized.

## Success metrics

Track: number of unblocked tests, time from reviewed commit to actionable CI failure, number of custom supervisor/deployer components on active execution path, outstanding release-control exceptions, CI hosted scenario coverage, and last proven nonproduction checkout. **Do not use a guessed launch-readiness percentage.**
