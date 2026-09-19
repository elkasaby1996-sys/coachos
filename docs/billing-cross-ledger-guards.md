# BILLING-DB-02 — Cross-ledger admission, environment and canonical-link guards

Based on merged BILLING-DB-01 (`e0f7291`), on branch `codex/billing-db-02-cross-ledger-guards`. This is private database safety work. It adds no provider transport, real mappings, payment validator, application caller, service-role grant, or Paddle entitlement writer.

## Migration and guarded surfaces

One forward migration: [`20260919103248_billing_cross_ledger_safety_guards.sql`](../supabase/migrations/20260919103248_billing_cross_ledger_safety_guards.sql). No prior migration is edited. No LS row, ID, receipt, event, fingerprint, mapping, or payment-proof predicate is rewritten.

The migration adds `billing_canonical_origins`, keyed by canonical `account_subscription_id`, with a same-account composite foreign key, a storage-contract discriminator and a recording timestamp. Existing canonical rows whose source is `billing_provider` are recorded as `lemonsqueezy.v1`. This includes superseded historical rows: a removed current provider link must not erase a canonical row's original provider ownership. No LS customer/subscription is copied to v2. The table has RLS, no application policies or grants, and immutable update/delete/truncate guards.

Twelve new functions are private invokers with fixed `search_path=pg_catalog,public` and no EXECUTE for `PUBLIC`, `anon`, `authenticated`, or `service_role`:

| Function                           | Responsibility                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `billing_guard_actor`              | Validate original database role; allow authenticated owners only on explicitly permitted owner paths |
| `billing_guard_lock`               | Require READ COMMITTED, lock policy and account, enforce optional environment                        |
| `billing_guard_expire_checkouts`   | Lock and expire both ledgers; retain ambiguous creation leases                                       |
| `billing_guard_checkout_conflict`  | Cross-ledger checkout and operation-UUID exclusion                                                   |
| `billing_guard_operation_conflict` | Cross-ledger plan/seat exclusion and UUID reservation; account-wide v2 exclusion                     |
| `billing_guard_claim_canonical`    | Validate canonical account linkage and reserve immutable contract ownership                          |
| `billing_guard_checkout_row`       | Guard both ledgers' inserts/updates and hold mapping locks through admission                         |
| `billing_guard_operation_row`      | Guard LS plan/seat and v2 combined operations                                                        |
| `billing_guard_subscription_row`   | Guard account linkage and approved-seat effects                                                      |
| `billing_guard_payment_row`        | Validate stored v2 subscription scope before payment-application insertion                           |
| `billing_guard_legacy_entry`       | Derive trusted account/environment linkage for existing LS entry points                              |
| `billing_v2_admit_checkout`        | Typed, private dormant intent admission and compatible retry; no external checkout creation          |

There are ten new triggers: eight admission/effect triggers across the two checkout tables, three operation tables, two subscription tables and v2 payment-application table, plus two immutable-origin triggers. The `a00_` names run guards before existing structural/history triggers. Existing triggers remain intact.

Eleven existing function definitions receive only a marked entry preamble: `begin_my_billing_checkout_attempt`, `expire_stale_billing_checkout_attempts`, `complete_billing_checkout_attempt`, `fail_billing_checkout_attempt`, `begin_billing_plan_change`, `begin_billing_seat_quantity`, `begin_cancel_billing_plan_change`, `begin_cancel_billing_seat_quantity`, `reconcile_billing_provider_subscription`, `apply_verified_billing_plan_change`, and `apply_verified_billing_seat_quantity`. Their remaining bodies, signatures, SECURITY DEFINER attributes and ACLs are retained. The migration refuses an unexpected body shape rather than guessing where to insert the guard.

## Lock discipline

Supported billing mutations use **READ COMMITTED**, one account per transaction:

1. Lock policy singleton `id=1` **FOR SHARE**. Hold it until commit, so an environment-policy change cannot race an admitted effect.
2. Lock the independently resolved `billing_accounts` row **FOR UPDATE**. Both contracts use this exact row, not separate provider advisory locks.
3. Inspect/lock ledger rows. Checkout expiration takes legacy rows, then v2 rows, each ordered by UUID. Admission observes both ledgers while holding the account lock.
4. Hold referenced mapping rows **FOR SHARE**, ordered by UUID in the new guards. Base and seat mappings remain protected until commit. Historical source mappings may be retired where existing contracts allow that; new target mappings must be active.
5. Write intent, operation, canonical-origin or authorized legacy effect rows. Existing FK and proof validation still run.

Legacy reconciliation retains its pre-existing delivery-row and provider-subscription advisory locks **between policy and account**. New admission paths do not acquire those locks after acquiring an account. Original reconciliation internals and replay serialization remain unchanged. Existing v1 proof functions continue to own effect authority.

Direct UPDATE triggers necessarily enter with their target tuple already locked. They request policy/account locks **NOWAIT**; contention returns SQLSTATE `55P03`, preventing a reverse row-to-account wait cycle. Expiration also uses NOWAIT for ledger tuples, defending against unsupported row-first writers. An authorized caller may retry the whole transaction after `55P03`; it must not retry an external provider mutation on that basis. Higher isolation levels fail closed with `25001`, because a transaction snapshot taken before an account-lock wait could otherwise miss the committed winner.

Administrative maintenance must not take a mapping lock and then invoke billing admission in the same transaction. Mapping retirement alone takes no account lock. Future multi-account writers must sort account UUIDs consistently and obey the same policy-first discipline. No multi-account mutation RPC is introduced here. The concurrency proof covers the supported paths and deliberate row-first failure; it is not a claim that arbitrary administrator SQL cannot deadlock.

## Cross-ledger invariants and retries

- Before a checkout insert, acquire the account lock, expire stale attempts in both ledgers and check both ledgers. `creating`, `ready` and `ambiguous` remain open. A creation lease expiring alone does not authorize a second sale. Actual expiration uses the original LS timestamps/comparisons; no truncation or serialization change is made to LS expiry precision.
- Another contract's use of the same account + operation UUID fails with `BILLING_GUARD_OPERATION_CONFLICT`, including terminal history. Another open checkout fails with `BILLING_GUARD_CHECKOUT_ALREADY_OPEN`. Rejected statements roll back their incidental expiry work; successful admission/explicit cleanup persists expiry.
- Existing LS retries retain the original response/compatibility rules. The private v2 helper reuses its original intent ID only when environment, canonical plan key, cadence and seat count match. It does not mint another provider checkout or return a provider URL. Terminal retry retains the terminal intent; callers cannot turn it into another sale.
- LS plan and seat operations inspect v2; v2 inspects both LS operation tables and other open v2 operations for the account. `completed`, `canceled` and `failed` are terminal. All other statuses remain blocking. Existing LS plan-vs-seat status/error semantics stay in the original code.
- An operation UUID cannot move between LS plan, LS seat and v2 ledgers, even after termination. Within v2, the existing account + UUID uniqueness and immutable intent fields reject duplicate/conflicting raw inserts. No new v2 operation RPC is exposed; a future typed caller must implement compatible-return semantics or retain fail-closed conflict behavior.

Admission helpers do not confer payment authority. The v2 helper is not executable by application/service roles and does not enable sales. Existing v2 composite keys independently enforce provider/environment/account, canonical plan/cadence and add-on cadence agreement; provider references remain opaque strings.

## Environment fence and canonical ownership

`billing_runtime_policy.entitlement_environment` governs new admission and entitlement-affecting effects. LS owner/service entry guards derive account identity from `auth.uid()`, a stored checkout/operation/subscription, or the stored webhook delivery. Row guards independently bind LS operations to their provider subscription and v2 payment applications to their subscription's account/provider/environment. Original caller authorization remains in place; a forged JWT service-role claim cannot replace the original database role check.

Wrong-environment admission, checkout completion, canonical linking, seat approval, operation progression and payment application fail with `BILLING_GUARD_ENVIRONMENT_MISMATCH`. Legacy reconciliation is fenced before it can execute its unchanged proof/effect body. Legacy checkout failure/expiration cleanup can still release an obsolete intent without granting entitlements.

Opposite-environment v2 customers, unlinked subscriptions, inbox deliveries and structural evidence can be retained. They cannot authorize canonical effects. A retained checkout from an earlier environment policy cannot complete after the policy switches. Evidence remains `billing-foundation-v1` / `structure-only-v1`, never verified Paddle payment authority.

Under the account lock, canonical ownership checks inspect both actual provider ledgers and the immutable origin registry. A canonical subscription must belong to the account and be paid. Once owned by one contract, the row cannot switch contracts after unlinking or supersession. Existing same-ledger constraints still apply. The registry does not itself link a provider subscription or grant entitlements.

**Both DB-01 hard stops remain:** v2 `account_subscription_id IS NULL` and `approved_additional_coach_seats=0`. The canonical-origin race test exercises reservation/exclusion without removing either constraint; separate SQL tests exercise attempted actual double linkage. Real Paddle canonical linkage is still impossible.

## Historical proof and regression adjustments

[`verify-billing-cross-ledger-manifest.py`](../scripts/verify-billing-cross-ledger-manifest.py) compares the original DB-01 manifest before/after this migration. It permits exactly the eleven marked preambles and four added legacy-table triggers. After removing only those exact additions, original function bodies and ACLs must compare identically. It rejects unexpected new guard functions/overloads, row/output/schema changes, and any additional legacy definition difference.

The populated synthetic baseline covers 21 tables, 304 rows, 283 original public function definitions/ACLs and 11 accounts' entitlement/capacity outputs. Only the original manifest's top-level `computedAt` exclusion applies. Stored receipt/payload/fingerprint hashes are included. No hosted data is read or mutated for this proof.

The existing foundation tests now measure application-callable writers rather than counting inaccessible private helpers. They pin a hard-stop fixture to the configured environment and configure each synthetic payment fixture's matching environment before insertion, restoring `test` afterward. Two v2 operation conflicts and one checkout scope assertion now expect the earlier safety guard. One LS checkout assertion expects the new environment rejection before mapping resolution. LS payment, plan, seat, expiry and replay proof assertions are unchanged.

## Local verification and reproduction

Use a disposable Supabase work directory with project ID `repsync_billing_db02`, PostgreSQL 17, local database port 55482 and shadow port 55480. Copy repository migrations/tests into it; keep database seed disabled. The concurrency script deliberately accepts no connection URL or container override and only operates on `supabase_db_repsync_billing_db02` after checking it contains no users.

1. Reset locally through `20260919092348` using `supabase db reset --local --workdir <directory> --version 20260919092348 --no-seed --yes`.
2. Execute `billing_v2_legacy_seed.psql` inside BEGIN/COMMIT. Capture `billing_v2_legacy_manifest.psql` with `psql -X -qAt -v ON_ERROR_STOP=1`.
3. Apply normal `supabase migration up --local --workdir <directory> --yes`, capture the manifest again, then run `python scripts/verify-billing-cross-ledger-manifest.py <before.json> <after.json>`.
4. Cleanly reset all local migrations without seeding. Run all pgTAP files with `supabase test db --local --workdir <directory>`.
5. Run `python scripts/test-billing-cross-ledger-concurrency.py`. It commits synthetic fixtures only in that disposable container. Each race uses independent real psql sessions and observes the contender's `pg_stat_activity` lock wait before releasing the winner; it does not rely on sleep ordering.
6. Reset the disposable database again to remove committed test fixtures. Run local database lint, affected unit suites, build/typecheck, lint, formatting and whitespace checks.

The concurrency matrix covers checkout exclusion in both directions, cross-contract UUID collisions, same-contract compatible retries, all four cross-contract plan/seat orderings, canonical-origin claims in both directions, base/seat mapping retirement, legacy mapping retirement, stale checkout expiration, row-first NOWAIT failure, policy changes and higher-isolation rejection. Assertions check a single admitted intent, retained expiry, canonical winner, zero database deadlock-counter increase, disabled flags and retained canonical/seat hard stops.

Verification on 2026-09-19, using the isolated local database only:

| Check                                                       | Result                                                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Normal migration over populated DB-01 baseline              | PASS; zero semantic manifest differences after the exact guard allowlist                                 |
| Clean local reconstruction, including final fixture cleanup | PASS                                                                                                     |
| All database suites                                         | PASS; 17 suites, 1,585 assertions, including all LS, foundation, entitlement, capacity and access suites |
| Real-session concurrency                                    | PASS; 21 cases, deterministic winner/rejection behavior, zero deadlocks                                  |
| Affected adapter/commercial/billing unit suites             | PASS; 27 files, 678 tests                                                                                |
| Database lint                                               | PASS; no errors                                                                                          |
| Build/typecheck                                             | PASS                                                                                                     |
| ESLint                                                      | PASS; zero errors, three existing warnings in client profile inputs, messages and workout run            |
| Formatting and whitespace                                   | PASS; repository Prettier check, `git diff --check` and new-file whitespace checks                       |
| Clean capability state                                      | `test`; both Paddle flags false; zero mappings, subscriptions, canonical links and approved seats        |

An initial unit run alongside the build hit the existing five-second commercial-access inventory timeout. The isolated test rerun and the complete affected-suite rerun passed without changing tests or timeout configuration. Concurrency fixtures were removed by a final clean local reset. SQL/PSQL/Python have no configured Prettier parser; SQL is validated by reconstruction, database lint and pgTAP, and both Python tools were executed successfully.

## Rollout limits and next PR

No commit, push, PR, merge, provider contact, hosted database mutation or deployment is part of this task. After a clean reconstruction, v2 mapping/evidence/customer/subscription/operation/checkout/payment tables remain empty. Both Paddle runtime flags remain false; no application grants are added.

Before a separately authorized rollout, the existing policy's entitlement environment must match the intended LS entitlement environment. DB-01 defaults to `test`; applying these guards to a live LS installation while leaving that value unchanged intentionally blocks live billing effects. Do not infer or silently change the policy from historical mixed-environment records. This migration itself does not change the policy, enable flags, or rewrite any historical data.

There is no destructive down migration. Keep v2 private, hard stops intact and flags disabled. If a guard defect needs compensation, use a reviewed forward migration for the exact guard; retain historical rows and origin reservations. An environment-policy correction requires explicit authorization for the named target project.

Recommended next PR: **design and implement a strictly verified provider-neutral receipt-to-database boundary**, with separate Paddle proof-schema/replay authority and narrowly scoped typed writers. It must distinguish structural observations from authenticated payment proof, preserve LS serialization, and supply a full environment/linkage/payment test matrix before proposing removal of any hard stop. Paddle API integration, real mapping publication and enablement remain separate work.
