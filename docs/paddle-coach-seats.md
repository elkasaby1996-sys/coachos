# Paddle additional coach seats

PADDLE-SEATS-01 is local implementation only. It adds no rollout enablement,
deployment, provider call, or staging certification. The existing four seat
endpoints route Paddle owners to the v2 operation ledger; Lemon Squeezy keeps its
existing handler and cancellation behavior.

## Representation and commands

Paddle subscriptions contain exactly one base item with quantity 1. Purchased
additional seats use a separate, verified same-cadence `coach-seat` mapping with
quantity N. At zero, the add-on is absent. Monthly seats cost 1200 USD minor units;
annual seats cost 12000. Launch permits 1 extra, Growth 3, Scale 5. Effective
capacity is the existing plan maximum capped included-plus-approved count.

The browser sends `targetAdditionalSeats` and, for apply, an `operationId`.
Preview and refresh create no operation. Server context resolves ownership,
canonical plan, provider shadow, periods, mappings, approved quantity and usage.
No browser request supplies provider references. Plan and seat operations retain
the shared one-open-operation guard, including scheduled and ambiguous states.
Plan changes with purchased additional seats remain ineligible.

The server transport uses the fixed Sandbox origin, one GET and at most one
PATCH per fresh action, a 30-second timeout, strict JSON, a 1 MiB response bound,
redirect rejection and no retries. Preview uses `/preview`; apply uses the normal
subscription update path. Refresh reads RepSync state only. Unrelated custom data
is preserved; each new intent replaces the previous billing operation marker.
The plan transport also removes a historical seat marker when a later eligible
zero-extra plan change starts. Its settlement proof is unchanged.

## Payment authority

An increase commits `seat_quantity / provider_pending` before dispatch, with
`prorated_immediately` and `on_payment_failure=prevent_change`. PATCH success does
not grant capacity. Subscription evidence alone moves the operation to
`awaiting_payment`. Payment may arrive first and remain pending.

Authenticated subscription and completed transaction observations must agree on
the exact account, subscription, operation, period, cadence and mappings. The
transaction must have origin `subscription_update`, USD, positive total, captured
payment at least that total and zero balance. Exactly one `seat_increase` payment
application precedes approval and completion, in the same database transaction.
The canonical plan row, provider shadow and initial purchase items are retained.

The supported synthetic settlement fixture is deliberately narrow: an add-on
line at **+target quantity**, plus a line for the previous add-on at **-source
quantity** when the source was nonzero. No unchanged base line is accepted. The
same add-on price can occur twice with these distinct signed quantities. Net
delta, both-negative lines, wrong magnitudes, unrelated items and partial payment
cannot authorize capacity. This is a locally tested contract, **not evidence of
real Paddle settlement shape**. Unsupported genuine provider shapes fail closed
for review; live certification must verify the shape without broadening it ad hoc.

Only `provider_pending`, `awaiting_payment`, and `ambiguous` may converge from
seat settlement evidence. `requested`, `scheduled`, `cancel_pending`, `completed`,
`canceled`, `failed`, and `manual_review` cannot. Exact retries return durable
state without GET or PATCH. Reusing the operation UUID with a different target
conflicts. Ambiguous mutation results remain non-dispatchable. Definitive payment
rejections retain approved source capacity. Later verified evidence may resolve
an ambiguous operation; neither refresh nor a late timeout redispatches it.

## Reductions and lifecycle

A decrease uses `do_not_bill`, records the original paid-period end, and requires
authenticated subscription evidence before becoming `scheduled`. It creates no
immediate payment application. Approval remains at the paid source quantity;
new reservations and invitations use the lower target ceiling immediately.
Current memberships, pending invitations and active reservations must fit the
target. The existing account locks serialize admission with reduction requests.

The wall clock alone never approves a reduction. At the boundary, matching
authenticated subscription and completed renewal payment evidence establish the
new paid period and apply the target once. Local tests simulate this boundary;
the real provider boundary remains unobserved. Normal updates, paid renewals,
past-due degradation and cancellation/expiration accept the exact approved or
operation-bound add-on item set. Unexpected drift cannot grant seats. Lifecycle
degradation during an unresolved seat operation preserves capacity authority and
marks that operation for review.

`billing_v2_seat_approval_disabled` is replaced by operation-bound proof guards,
not unrestricted writes. Direct SQL changes cannot grant approved seats. Private
facts/evidence helpers are unavailable to browser and service roles; only the
existing server/service command boundary can construct verified authority.

## Owner experience and deferred scope

The existing coach-seat panel displays approved quantity, price/cadence, current
capacity, payment pending, target/effective date, lower admission ceiling,
ambiguity/manual review, and a blocking plan operation. Paddle copy names Paddle
and identifies recurring totals as list prices, not collected payment or an exact
proration quote. Paddle reduction cancellation is explicitly unsupported and its
button is hidden. Legacy cancellation remains available.

No seats may be certified against Purchase #1 while its existing scheduled plan
downgrade remains open. Cancellation of a Paddle seat reduction, plan changes
with extras, production activation and provider certification are deferred.

## Local verification

Permanent coverage lives in `paddle_seat_quantity.sql`, its synthetic fixture,
`paddle-seat-quantity.test.ts`, presentation/plan-marker regressions,
`paddle-coach-seats.spec.ts`, and `test-paddle-seat-concurrency.py`. Browser tests
use local authentication and mocked safe Paddle contracts; SQL tests exercise
the real ingestion, reconciliation, proof guards and capacity readers.

Run SQL and concurrency against a freshly reconstructed disposable local
database. The concurrency runner accepts no remote URL or container override and
requires an empty local fixture database. Reset its committed fixtures afterward.
All 177 historical migrations are unchanged; the single new migration is
`20260927133343_paddle_coach_seats.sql`. Manifest hashes bind the final bytes.

Exact changed-file inventory and current verification results are recorded in the
local implementation report. CI classification remains untouched pending a
separate release-packaging task. Independent review should focus on exact signed
settlement evidence, proof/approval trigger ordering, lifecycle continuity,
boundary-only reductions, account-lock races and the preserved plan proof.

## CODEX-25 reviewed local inventory

Base and HEAD: `a76feafdaaaa3b414c8cf823002e1ad8905b4b1f` on `main`.
All changes remain uncommitted. There are 22 changed/new implementation,
test, manifest and documentation files:

- `config/staging-commercial-certification.json`
- `docs/paddle-coach-seats.md`
- `docs/staging-commercial-deployment-manifest.md`
- `scripts/test-paddle-seat-concurrency.py`
- `src/features/billing/seat-quantity-contracts.ts`
- `src/features/billing/seat-quantity-panel.tsx`
- `supabase/functions/_shared/billing-handlers.ts`
- `supabase/functions/_shared/billing-runtime.ts`
- `supabase/functions/_shared/billing-seat-quantity.ts`
- `supabase/functions/_shared/paddle-plan-change.ts`
- `supabase/functions/_shared/paddle-seat-quantity.ts`
- `supabase/functions/_shared/paddle-webhook/contract.ts`
- `supabase/functions/_shared/paddle-webhook/observation.ts`
- `supabase/migrations/20260927133343_paddle_coach_seats.sql`
- `supabase/tests/billing_verified_evidence.sql`
- `supabase/tests/fixtures/paddle_seat_fixture.psql`
- `supabase/tests/paddle_seat_quantity.sql`
- `tests/e2e/paddle-coach-seats.spec.ts`
- `tests/e2e/utils/paddle-seat-fixture.ts`
- `tests/unit/billing-seat-quantity-panel.test.ts`
- `tests/unit/paddle-plan-change.test.ts`
- `tests/unit/paddle-seat-quantity.test.ts`

Three paths extend the starting inventory: the existing Paddle plan transport
and its unit test remove an obsolete seat marker after a later eligible plan
change; `billing_verified_evidence.sql` replaces two obsolete blanket-zero-seat
assertions with the new proof guard and exact direct-mutation rejection. No CI
classifier, workflow, dependency, secret or historical migration is edited.

## Final local verification � 27 September 2026

Verdict: **READY_FOR_INDEPENDENT_REVIEW**. This is not provider certification or
release approval. HEAD is unchanged and all 22 files remain uncommitted.

| Check                           | Command / evidence                                                                                                                                                                        | Result                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Targeted units                  | `npx vitest run tests/unit/paddle-seat-quantity.test.ts tests/unit/billing-seat-quantity.test.ts tests/unit/billing-seat-quantity-panel.test.ts`                                          | Initial focused pass: 87 passed; subsequent additions included in final full pass          |
| Full units, final tree          | `npm run test:unit`                                                                                                                                                                       | 293 files, 3,391 tests passed; exit 0                                                      |
| Migration reconstruction        | `npx --no-install supabase db reset --local --workdir "$env:TEMP/repsync-paddle-reconciliation01" --yes`                                                                                  | All 178 migrations reconstruct successfully; exit 0                                        |
| Full local SQL                  | `npx --no-install supabase test db --workdir "$env:TEMP/repsync-paddle-reconciliation01"`                                                                                                 | 31 files, 2,931 assertions passed; exit 0; includes 154 new seat assertions                |
| Concurrency, final tree         | `python scripts/test-paddle-seat-concurrency.py`                                                                                                                                          | 15 real lock-wait cases passed, zero deadlocks, zero provider calls; exit 0                |
| Relevant browser suites         | `npx playwright test tests/e2e/paddle-coach-seats.spec.ts tests/e2e/billing-coach-seats.spec.ts tests/e2e/billing-plan-change.spec.ts`                                                    | Four workers, zero retries: 24 passed and four initial legacy-seat timeouts                |
| Affected browser rerun          | `npx playwright test tests/e2e/billing-coach-seats.spec.ts:7 tests/e2e/billing-coach-seats.spec.ts:56 tests/e2e/billing-coach-seats.spec.ts:86 tests/e2e/billing-coach-seats.spec.ts:129` | Four workers, unchanged timeouts/assertions, all four passed; exit 0                       |
| TypeScript and production build | `npm run build` (`tsc -b && vite build`)                                                                                                                                                  | Passed; exit 0                                                                             |
| Edge types                      | `npx --yes deno check --no-lock` on the four coach-seat entry points, Paddle webhook and plan preview entry point                                                                         | All six dependency graphs passed; exit 0                                                   |
| Lint                            | `npm run lint`                                                                                                                                                                            | Exit 0, no errors; three warnings in unchanged files                                       |
| Formatting                      | `npm run format`                                                                                                                                                                          | Passed; exit 0                                                                             |
| Manifest                        | `npm run staging:commercial:validate`                                                                                                                                                     | Valid; new migration bytes match checksum; prior 177 entries/hashes unchanged              |
| Diff                            | `git diff --check`                                                                                                                                                                        | Passed                                                                                     |
| Active-output/source check      | Changed files, new run logs and built text assets scanned; run logs and Playwright artifacts sanitized                                                                                    | No hosted/private provider reference or credential patterns found in final scanned outputs |

All 28 relevant browser cases have passing evidence across the initial run and
the affected rerun: four new Paddle seat cases, eight legacy seat cases and 16
plan-change cases. This is **not** represented as a clean 28-case first pass.
The initial four timeouts occurred with roughly 400 MB free host RAM. The same
four tests passed unchanged on their targeted rerun. Vite also reported font
files outside its serving allowlist because this worktree shares dependencies;
no application/test settings were changed to suppress this warning.

The initial full SQL run had two obsolete verified-evidence assertions expecting
the old blanket-zero-seat restriction. They now require the enabled row-level
INSERT/UPDATE proof trigger and exact rejection of unauthorized seat writes.
The initial full unit run had 3,388 passing tests and one manifest hash failure:
Windows line endings on the new migration caused the mismatch. The new migration
was normalized and its checksum corrected; checksum validation was not weakened.
Final results above are from the corrected final tree.

Lint warnings are unchanged at `src/components/client/profile-inputs.tsx:96`,
`src/pages/client/messages.tsx:983`, and `src/pages/client/workout-run.tsx:576`.
No existing assertions, worker counts, retries or timeouts were relaxed.

Privacy: only synthetic fixtures and a disposable loopback Supabase stack were
used. A local bootstrap credential block was emitted once during inspection;
its persisted run log was subsequently redacted. No hosted credentials, real
provider references or real account records were accessed. The disposable
stack was reset after committed concurrency fixtures and stopped. Browser
sessions were local Playwright contexts and closed by the runner.

Paddle calls = **0**; staging writes = **0**; production access = **0**;
remote deployments/migrations = **0**; commits = **0**; pushes = **0**; PRs = **0**.
CI classification, GitHub settings, secrets and production configuration were
not changed. The next action is independent review of this uncommitted delta.
Real settlement shape, provider behavior and the natural renewal boundary remain
uncertified and require separately authorized future work.
