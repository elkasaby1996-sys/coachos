# RepSync CI/CD simplification — control-equivalence register

**As of 2026-10-20.** This is a decision/acceptance register, **not** a certificate. `NOT_PROVEN` is blocking when marked required. Source review, local tests and hosted operation are separate evidence classes.

| ID | Required behavior | Potential simpler mechanism | Acceptance evidence | State |
| --- | --- | --- | --- | --- |
| V-01 | Immutable reviewed source and dependencies | Protected PR, exact SHA and `npm ci` lockfile; pinned GitHub Actions/Node | PR required checks bind tested commit, package/native identity and artifacts | NOT_PROVEN for uncommitted billing candidate |
| V-02 | TS/unit/lint/build/Edge compatibility | Existing `quality` job | Full results on candidate without suppressing failures | Existing workflow; candidate NOT_RUN |
| V-03 | Migration ordering, RLS and concurrency | Owned ephemeral CI Postgres/Supabase + existing tests | Exact 188 migrations, RLS, 641 SQL assertions and concurrency replay | Local evidence only; CI NOT_PROVEN |
| V-04 | Browser checkout reopen/server authority | Existing `smoke-e2e` plus billing-specific Playwright | Correlated SDK-triggered requests, unchanged canonical entitlements, idempotent creation, no secret leakage, full teardown | BLOCKED |
| V-05 | Browser and fixture isolation | Hosted disposable CI workspace/project | Ownership, database/port/network, credentials, secret redaction and final disposal receipts | NOT_PROVEN |
| V-06 | CI supply-chain / runner control | Pinned GitHub runner actions, Node and dependencies | Workflow-source and artifact identities; trusted host boundary | NOT_PROVEN |
| R-01 | Exact reviewed deployable payload and target | Protected `main` staging workflow, attested SHA/target | C/R source identity, GitHub environment and deployment artifact digests | NOT_PROVEN |
| R-02 | Exact attempt human approval / no bypass | Potential environment-protection policy + evidence adapter | Authenticated normal approval on exact run/attempt, admin bypass exclusion | BLOCKED; current ordinary environment metadata insufficient |
| R-03 | Durable replay, private custody, fencing | Scoped deployment state machine/storage | Atomic nonce and run/attempt claims, proven no double dispatch, process ownership | BLOCKED |
| R-04 | Credential confinement | Environment-scoped short-lived/least-privilege credentials | No pre-approval secret access, target-constrained capability, revoke/rotation proof | BLOCKED |
| R-05 | Fixed 186→187→188 release | Versioned migration manifest with real checkpoints | Exact SQL digests; backup+restore; no 187 final function deployment; checkpoint 188 | Source prep only, NOT_PROVEN |
| R-06 | Staging/production isolation | Distinct environments, explicit deny targets | Actual remote refs/origins, no leakage/misrouting, sandbox flags false | NOT_PROVEN for new release |
| R-07 | No live payment without certification | Disabled feature/policy flags + real Paddle sandbox certification | Required scenario matrix, provider-webhook and DB consistency, negative cases | BLOCKED |
| R-08 | Recovery/rollback and visibility | Reviewed backup, restore drill and monitoring | Real restore, migration forward recovery, telemetry, incident owner | NOT_PROVEN |
| S-01 | Privileged SQL never publicly exposed | Eliminate/contain legacy `/pg/query` route; never use it for CI | Passive configuration and separately authorized containment verification | INVESTIGATION REQUIRED |

## Evidence classes

- **Source/design:** correctness arguments and static validation. Does not imply compiled/runtime behavior.
- **Local controlled execution:** proves the exact local environment/scenario only.
- **Hosted CI:** proves the exact checked commit and runner graph/scenarios, not staging parity automatically.
- **Hosted staging:** proves the bound provider/backend/configuration/authorization scenario.
- **Production:** requires fresh authorization and its own gate; staging results are not permission.

## Strict adoption rule

For a control deemed necessary, simplification is acceptable only if (a) the new implementation preserves or improves enforceable protection, (b) concrete evidence passes, and (c) the old execution path is retired or kept inert without conflicting release authority. Unsupported controls remain blocking. A deliberate founder policy revision is separately documented and is **not implied by this ADR**.

## Project-document propagation

- Repository: ADR + migration plan + this register; cross-reference in `staging-release-phases.md`, `staging-founder-governance.md`, `github-operations.md`, `release-go-no-go.md` and historical `beta-release-readiness.md`.
- ChatGPT Project Source files: add decision addendum/reference after review; do not overwrite operating standard/routing policy.
- RepSync Launch Atlas: reflect `CI modernization — approved direction / implementation unverified`, separate local verification from hosted checks and keep remaining blocking gates. Update there only using authorized Site/Page editing tools.
- Integration PRs: link actual implementation SHA and check evidence to this register, updating row states only with proof.
