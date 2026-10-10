# Founder-owned synthetic staging governance

PAY-05BF implements the PAY-05BE conditional architecture as local code and tests.
It enrolls no key, authenticates no real founder, signs no operational evidence,
verifies no hosted settings and authorizes no remote operation. Separate Astra
review is required before accepting the candidate.

## Disarmed scope and truthful acceptance

The source-reviewed `config/staging-founder-governance.json` initially has
`enabled: false`, no keys, no founder, no authenticated numeric repository identity
and no validity window. No environment key override, signer or approval fallback
exists. The legacy timing registry remains unchanged and empty.

`founder_owned_synthetic_staging_v1` permits only repository
`elkasaby1996-sys/coachos`, environment `supabase-staging`, project
`exmrksgdikfprtfeltzu`, organization `aerjnyzewgglcpkbrxyn` and origin
`https://repsync-staging-replacement.netlify.app`. Enrolled numeric repository and
human identities require authenticated source review; test IDs confer no authority.
Production `btrfmxjpjzbyowtvncnc`, archive `dgogugyuyfourdttvwuy`, other targets,
origins, repositories/environments, live Paddle, production customer data/imports
and promotion to production reject. The scope is sandbox and synthetic-only.

Operator and approver equal the enrolled authenticated founder subject, with
`independentOfOperator: false` and `sameHuman: true`. Two accounts, keys, CI or Astra
do not create human independence. Every signed governance block requires acceptance
version 1 and the exact statement:

> I am both operator and approver. This is not independent human review. Current
> observations and my attestations cannot prove the absence of undisclosed historical
> changes later restored. I accept the documented residual risk only for the
> identified isolated synthetic staging scope. My error, compromised credentials,
> or misuse of administrative authority may defeat controls under my ownership.

Provenance and historical evidence hashes, limitations, complete creation/access/
configuration history and actual writer/ingress exclusions remain required. Unknown
or contradictory history, customer modification, unauthorized imports/restores,
unexpected customization and unsafe SQL/roles/ACL/RLS still block. Acceptance cannot
waive a technical predicate. A fresh project requires separate creation authority,
reviewed target changes and new enrollment/evidence; authority never follows it.

## Contracts, keys and ordering

| Contract                     | Founder version | Verification                                                       |
| ---------------------------- | --------------- | ------------------------------------------------------------------ |
| Virgin baseline              | 3               | evidence key; `repsync-founder-staging-baseline/v1`                |
| Complete observation receipt | 3               | unsigned measurement reviewed by timing admission                  |
| Timing admission             | 3               | evidence key; `repsync-founder-staging-timing/v1`                  |
| Private delivery descriptor  | 2               | policy/action digests, signed-baseline digest and raw file SHA-256 |
| Action envelope              | 1               | action key; `repsync-founder-staging-action/v1`                    |

Ed25519 enrollment binds SPKI fingerprint, founder subject, authority class, explicit
purposes/phases, exact scope, validity and revocation. Evidence keys permit baseline/
timing review; action keys permit actions only. Unknown keys/fields, changed evidence,
wrong domains/versions and cross-purpose signatures reject. Keep private keys in
protected founder custody outside source, CI, artifacts and Codex.

Legacy independent baseline/admission/receipt version 2 and delivery version 1 retain
their strict validators and registry. Founder variants require explicit founder
context and cannot satisfy legacy validation. No coercion, relabeling, auto-upgrade
or signature fallback exists. Inner bootstrap authorization remains v2 and release
authorization v3, with all their existing technical validations.

Ordering is signed baseline, complete observations, inner authorization, signed
action, then signed timing admission binding authorization and action. There is no
circular signature dependency. Capture uses a separate `CAPTURE_BASELINE` preflight
action binding the supplied operator evidence and expiry; it returns an unsigned v3
candidate, never automatic acceptance or operational approval.

## Workflow and replay boundaries

Actions bind exact phase and preflight/apply mode, inner authorization digest,
SHA/tree, main workflow name/ref, numeric repository and actor, run ID/attempt,
nonce, expiry and signed workflow-evidence digest. Preflight never permits apply.
Migration actions have a distinct approval record for ordered migration hashes,
checkpoint contracts and existing backup/recovery evidence. Fixed resume phases
still require fresh recovery documents and a new action; there is no automatic resume.

Staging workflows explicitly select founder mode, which remains disabled by source
policy. Credentials/actions are referenced only in protected remote steps; no
credential is enrolled or read by PAY-05BF. Plan remains local and unsigned.
Bootstrap runs full units; release retains quality/full-unit gates. Artifact uploads
allow only sanitized `release-evidence.json`, excluding private baselines.

Trusted interfaces are deliberately unconfigured in operational code:

- `verifyWorkflowApproval(action)` must authenticate actual GitHub environment
  approval, no bypass, protected main, required checks for the exact SHA/tree,
  approver and run/attempt. Its fresh returned evidence digest must match the signed
  action. Candidate booleans, environment labels and founder assertions cannot
  implement this integration.
- `claimAction(action)` must atomically retain durable unique claims for both nonce
  and repository/environment/run/attempt/phase/mode before remote capability use.
  Replays, concurrent claims, a new nonce in the same slot, missing retention or
  unavailable storage reject. A failed consumed action cannot be retried.

Only explicit synthetic test dependencies implement these interfaces here. CLI
defaults block hosted use even after hypothetical key enrollment. Future adapters
need separate source review; no generic URL/key/environment-flag fallback exists.
Private delivery passes its claimed operation handle to the consumer, which can
recheck the same claim through trusted runner dependencies. Runner gates revalidate
action/signature/policy/approval before capabilities and subsequent mutations.
Guarded adapters recheck actions at remote request/command boundaries. Expired or
revoked founder authority also prevents failure-path inventory collection.

## Operational prerequisites and audit

Separately review code with Astra; pass blocking CI/database regressions; authenticate
enrollment; verify actual required checks, protected main and environment settings;
require founder manual approval with truthful self-review permitted and administrator
bypass disabled; establish trusted approval verification, durable replay/audit and
private-delivery integrations. Unsupported protection settings remain a blocker.
YAML environment names do not prove hosted protection.

Retain immutable or independently retained private evidence before releasing scoped
credentials. Record policy/key IDs, SHA/tree, exact scope, signed acceptance/history,
complete observations/timing, run/attempt/nonce, manual approval and check results,
separate migration approval, backup and actual disposable restore proof, checkpoints,
outcomes/failures and durable claim receipts. Publish sanitized digests/statuses only.
A backup file or digest alone does not establish recoverability.

Use short-lived target-scoped credentials where supported and controlled delivery.
Persistent database passwords require post-operation rotation/revocation; approval
expiry does not expire passwords. Rotation needs reviewed enrollment and fresh
evidence. Revocation requires cancelling queued/running operations, revoking their
credentials and removing enrollment; a new main policy alone does not revoke an
older checked-out policy.

Timing remains 60-second complete observations, 15-minute evidence freshness,
30-minute maximum authorization, original 45-minute workflow budget, three distinct
complete samples, existing allowances and 25% margin. Bootstrap conservative
admission additionally reserves baseline capture-start plus 15 minutes and baseline
expiry. Failure means stop, preserve evidence and obtain fresh recovery authority.

Enabled policy has a mandatory expiry. Retire/reassess authority before wider
customer onboarding, real-customer data, another target or changed scope. After
installation verification, a synthetic Paddle owner requires separately reviewed
creation/classification provenance and named sandbox test authority; email appearance
alone does not establish synthetic status. Existing customer gates still apply.
Bootstrap/release permit no provider transactions or customer-data imports.

Billing event/reconciliation monitoring, backup/restore readiness and explicit
certification go/no-go remain required. Astra reduces implementation mistakes but
cannot sign as an independent human operator. All 31 remote scenarios remain
`not_run`; local tests do not certify payments, webhook signatures/order/idempotency,
subscriptions/entitlements, plan/seat changes, renewal/recovery, cross-account
security, reconciliation or live-provider readiness.
