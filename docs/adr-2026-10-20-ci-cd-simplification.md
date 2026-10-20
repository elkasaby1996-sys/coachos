# ADR-2026-10-20 — Simplify RepSync verification and release delivery

**Decision date:** 20 October 2026  
**Status:** Direction approved by founder; replacement implementation and control equivalence NOT yet qualified.  
**Canonical decision:** Prefer existing, well-supported GitHub Actions / Supabase / Netlify capabilities over bespoke local Windows launchers and overlapping release controllers **only where the necessary controls can be demonstrated**.

## Decision

RepSync will pursue a simpler **security-preserving** CI/CD pathway. Simplification changes how tests are executed and releases are governed; it does **not** relax application security, billing state authority, financial correctness, data isolation, backup obligations or production approval. No current deployment is authorized by this ADR.

**Existing infrastructure to reuse:** `.github/workflows/ci.yml` already installs Node 22 with `npm ci`, performs edge typechecks, unit tests, lint/format/build, and exercises local disposable Supabase plus Playwright in `smoke-e2e`. `.github/workflows/supabase-deploy-staging.yml` and `supabase-deploy-production.yml` already separate manual deployment targets. `main` requires `quality` and `smoke-e2e`. We will first verify the actual results and trust boundaries of those existing workflows; do not create a redundant CI platform.

### Current evidence is not release qualification

- Source baseline on GitHub at this decision: `main` `9089060489295c7ce36d6798c283a2ad9d2141bf` (10 Oct 2026).
- Protected local billing checkout `codex/pay-live-01b-recovery` at that HEAD holds 63 uncommitted paths (35 modified, 28 untracked; none staged), reported candidate tree `e27d011486945cdca6ca880ad9e8d577f631e6a9`. It is **not** a deployable commit.
- Locally reported: 188 migrations applied; 641 SQL assertions and four concurrency cases passed; 14 Edge entrypoints typechecked. These are not hosted staging/payment certifications.
- Compiled native launcher unavailable: the first compilation attempt stopped before execution for want of an accepted parent.
- External browser harness has six Astra source-review findings (two high); no browser or fixture execution.
- Disarmed GitHub governance adapter source review accepted; release-profile 186→188 proposed with 230 Node tests but pending independent review as of this decision.
- Paddle hosted scenario certification remains outstanding; live activation disabled.
- Possible wildcard-bound existing `coachos` privileged `/pg/query` gateway is an **unresolved local containment concern**; external exploitation unproven.

## Non-negotiable controls

1. **Authorization and isolation:** RLS and role/tenant boundaries, server-enforced entitlements and limits, service-role secrecy, authenticated Edge Function access; no frontend-paid-state authority.
2. **Payment integrity:** Paddle signature verification, correct mapping, transaction idempotency, reconciliation, webhook retries, concurrency/locking, negative tests and the full applicable commercial scenario matrix.
3. **Build/test integrity:** reviewed immutable source commit, lockfile-bound reproducible dependency install, scoped credentials, substantive TypeScript/unit/SQL/RLS/migration/Playwright checks, provenance of exact passing checks and build artifacts.
4. **Environment separation:** sandbox/test checkout only in controlled staging, explicit deny targets for production/archive, least-privilege service access, no remote Supabase mutation without fresh authorization.
5. **Release authorization:** protected branch and reviewed artifacts, human approval as required, exact commit/run/attempt binding, replay/custody/fencing and credential containment suitable to the threat model; failure closes access.
6. **Recovery and observability:** verified migration ledger, backups and usable restore exercise, safe forward recovery, scoped logging, no secret/session tokens in artifacts, rollback/incident response.
7. **Production readiness:** post-deployment smoke, monitoring, bounded initial paid pilot, clear owner and audit trail.

**Known non-equivalence:** Standard GitHub Environment approval alone has NOT been demonstrated to prove the existing exact-attempt normal approval/no-bypass and durable replay/custody/credential-fencing contracts. Treat this as a blocking exception. Do not auto-declare parity or waive those requirements. Any proposed governance policy change needs an explicit risk decision and updated approval/rollback evidence before activation.

## Strategy

- **Test execution:** Prefer the already existing GitHub-hosted Node 22 CI job to an unqualified local Windows native launcher. Pin and verify the actual Node/tool/dependency graph, fail closed on anomalies; preserve source/review evidence.
- **Browser:** Extend the existing isolated CI Supabase + Playwright smoke path for the billing candidate, using fixed synthetic SDK fixtures without a real payment, realistic server-state assertions and no privileged SQL HTTP gateway. Preserve expected privacy/cleanup properties.
- **Database:** Reuse the existing passing local DB-02 evidence; add reproducible CI SQL/RLS/concurrency gates with owned ephemeral resources. Do not rerun destructive local test procedures against protected resources.
- **Release:** Explore simplifying the staging plan/preflight/apply path *behind disarmed controls*. Only switch to a new workflow after an explicit parity review of exact commit, protected approval, secret exposure, backups/restore, migration suffix 187/188, synthetic flags, replay/fencing and recovery. Retain old runner disabled/untouched until a qualifying replacement is accepted.
- **Production:** No change to production workflows, live Paddle flags, linked databases or Netlify site state in this documentation PR.

## Architecture guardrail: do not rebuild existing product

Billing, Webhooks, subscriptions, package limits, RLS, React Query and their present contracts remain canonical. Work is a **delta** to CI/verification/release infrastructure, not a rebuild of application billing logic. A standard tool is only acceptable when it demonstrates the same necessary protection; fewer source lines are not a security argument.

## Gates to adoption

| Gate | Evidence required | Current status |
| --- | --- | --- |
| CI-B01 | Existing CI can run pinned Node 22, TypeScript, unit and build on reviewed checkout | Workflow exists; billing candidate untested in hosted CI |
| CI-B02 | Disposable SQL/migrations/RLS/concurrency tests with positive owned-resource proof | Local DB tests passed; CI transfer unqualified |
| CI-B03 | Playwright checkout event/reopen/server-state checks under explicit mock/egress/cleanup boundary | Blocked, no execution |
| REL-B01 | Exact immutable reviewed payload, checkpoint 186→187→188 and source/artifact parity | Prepared; not approved for release |
| REL-B02 | Protected approval/attempt, replay, custody, fencing, credential safety, rollback/restore parity | Blocked |
| PAY-B01 | Full required real Paddle sandbox scenario matrix | Not run |
| OPS-B01 | Close/contain existing local privileged SQL gateway risk | Unresolved |

## Rollout and reversibility

Implement in short nonproduction changes with independently reviewed evidence. Compare control equivalence before retiring any custom safeguard. Preserve old source and artifacts for audit, but prevent duplicate operational release paths. Backout is reverting unmerged CI changes; **never** reset/rewrite the billing candidate or change remote staging to shortcut a gate.

References: [Migration plan](ci-cd-simplification-plan.md), [Control matrix](ci-cd-control-equivalence.md), [Release phases](staging-release-phases.md), [Founder governance](staging-founder-governance.md), [Release Go/No-Go](release-go-no-go.md).
