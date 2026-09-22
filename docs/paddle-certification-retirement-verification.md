# PADDLE-CERT-FIXTURE-02 verification

Implementation branch: `codex/paddle-cert-fixture-02-retirement`.
Base: latest fetched `origin/main`, `cbfd8b4` (PR #232), including PR #231.
Working tree was clean before implementation. No commit, PR, merge, deployment,
remote database/Auth mutation, provider request, or notification configuration
was performed. Staging certification completion and closure are operator-confirmed
inputs; all newly measured results below concern the disposable local database.

## Dependency audit

`git grep` across every tracked file at the base found exactly these five files
referencing the five specified certification symbols:

| File                                                                           | Classification                                                                             |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `supabase/migrations/20260920105937_paddle_checkout_certification_fixture.sql` | Migration definitions: table, create/close RPCs, private gate, grants and history triggers |
| `supabase/tests/paddle_checkout_certification_fixture.sql`                     | DB tests                                                                                   |
| `supabase/tests/fixtures/paddle_certification_fixture.psql`                    | Local fixture/test helper                                                                  |
| `scripts/test-paddle-cert-fixture-concurrency.py`                              | Local fixture/concurrency test helper                                                      |
| `docs/paddle-checkout-certification-fixture.md`                                | Documentation                                                                              |

Production/runtime dependencies: **none**. The gate is called only by the two
fixture RPCs. Normal checkout, webhook ingestion, entitlement/capacity, billing
runtime, reconciliation and production code do not reference these symbols.
The original migration remains byte-for-byte unchanged. Original tests are
retained as a pre-retirement `.psql` fixture; no replacement deployed authority
is created. The post-retirement catalog test checks all public routine bodies
and views for surviving certification access, beyond checking exact signatures.

## Change and deployment boundary

CLI-generated migration:
`20260922094541_paddle_certification_fixture_authority_retirement.sql`.
It checks for open history rows under an exclusive lock, raises a deployment
blocker without cleanup, and drops exactly the three functions without CASCADE.
It changes no rows, grants, triggers, RLS, Auth metadata, or billing flags.
The Auth Admin cleanup is a separate post-deployment staging operation documented
in the [fixture runbook](paddle-checkout-certification-fixture.md).

All 170 previous manifest entries/hashes are unchanged. Exactly one entry is
appended and the latest pointer advances. No other manifest field changes.

## Proposed commit and PR

Commit: `Retire temporary Paddle certification fixture authority`

PR title: `PADDLE-CERT-FIXTURE-02 — Retire temporary Paddle certification authority`

Proposed PR description:

> Webhook staging ingress certification already passed. This PR removes the
> temporary certification create/close RPCs and private gate, while preserving
> historical fixture evidence and its access/history protections. An open fixture
> blocks migration rather than being automatically closed or deleted.
>
> No Paddle provider calls, sales activation, reconciliation activation, or payment
> or entitlement authority are introduced. Staging is not mutated by the PR itself.
> Auth certification designation removal is documented as a separate reviewed
> post-deployment staging operation through Auth Admin.
>
> Require protected `quality` and `smoke-e2e` CI before merge; do not auto-merge.
> After a separately authorized merge, report merged PR/main state and stop for
> review of the separate staging retirement deployment.

## Final results

Recommendation: **READY_FOR_COMMIT**. Stop before commit.

| #   | Required result                          | Outcome                                                                                                                                     |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Runtime dependencies found               | no                                                                                                                                          |
| 2   | Create fixture RPC retired               | yes                                                                                                                                         |
| 3   | Close fixture RPC retired                | yes                                                                                                                                         |
| 4   | Certification gate retired               | yes                                                                                                                                         |
| 5   | Fixture history table retained           | yes                                                                                                                                         |
| 6   | Historical fixture rows preserved        | yes; 9 populated upgrade fixtures and all public rows unchanged                                                                             |
| 7   | All historical fixtures closed           | yes in populated local proof; staging closure supplied by operator                                                                          |
| 8   | RLS retained                             | yes                                                                                                                                         |
| 9   | History triggers retained                | yes                                                                                                                                         |
| 10  | Direct DML remains denied                | yes                                                                                                                                         |
| 11  | DELETE protection retained               | yes                                                                                                                                         |
| 12  | TRUNCATE protection retained             | yes                                                                                                                                         |
| 13  | service_role fixture authority           | absent                                                                                                                                      |
| 14  | anon/authenticated fixture authority     | absent                                                                                                                                      |
| 15  | Replacement/indirect fixture authority   | not-found                                                                                                                                   |
| 16  | Normal checkout regression               | pass                                                                                                                                        |
| 17  | Webhook ingestion regression             | pass                                                                                                                                        |
| 18  | Subscription shadow regression           | pass                                                                                                                                        |
| 19  | Cross-ledger regression                  | pass                                                                                                                                        |
| 20  | Entitlement/capacity changes             | 0                                                                                                                                           |
| 21  | Payment applications                     | 0                                                                                                                                           |
| 22  | Canonical Paddle links                   | 0                                                                                                                                           |
| 23  | Approved Paddle seats                    | 0                                                                                                                                           |
| 24  | Table grants broadened                   | no                                                                                                                                          |
| 25  | New authority introduced                 | no                                                                                                                                          |
| 26  | Staging Auth-metadata cleanup documented | yes; not executed                                                                                                                           |
| 27  | Generated migration filename             | `20260922094541_paddle_certification_fixture_authority_retirement.sql`                                                                      |
| 28  | Exact changed files                      | nine, listed below                                                                                                                          |
| 29  | DB/unit/concurrency totals               | 2,021 head DB assertions + 70 historical assertions; 2,896 unit tests; 17 race cases + 15 concurrent denial pairs; all pass, zero deadlocks |
| 30  | Private-value leakage                    | pass                                                                                                                                        |
| 31  | Recommendation                           | `READY_FOR_COMMIT`                                                                                                                          |

All privilege/authority results above concern the reconstructed local post-migration
schema. There is no new SECURITY DEFINER function or browser-visible authority.
PUBLIC has no history ACL or certification execution authority. Billing-v2 tables
remain private, and service_role continues to use the existing reviewed RPCs.
No payment, entitlement, reconciliation, sales, or Lemon Squeezy authority/state
changes were introduced. The populated upgrade comparison included all 126 public
tables, preserving existing LS rows and every checkout/evidence/shadow record.
Historical superuser test setup is confined to local test files; no such helper
is installed by the retirement migration.

### Validation evidence

| Check                                                                      | Result                                    |
| -------------------------------------------------------------------------- | ----------------------------------------- |
| Clean reconstruction through PR #232, then populated forward upgrade       | pass                                      |
| Original certification/history pgTAP                                       | 70 passed                                 |
| Original fixture concurrency                                               | 9 cases passed                            |
| Open-fixture blocker and failed-migration snapshot comparison              | pass                                      |
| In-flight fixture creation vs retirement table lock                        | 1 race passed                             |
| Concurrent retired RPC/DML attempts across service_role/authenticated/anon | 15 pairs / 30 attempts denied as expected |
| Clean reconstruction through all 171 migrations                            | pass                                      |
| Full DB suite                                                              | 24 files, 2,021 assertions passed         |
| Webhook concurrency including deferred subscription validator commits      | 7 cases passed                            |
| Full unit suite                                                            | 2,896 passed, zero failed/skipped         |
| Manifest validation and exact prior-entry/hash comparison                  | pass                                      |
| DB lint on final clean reconstruction                                      | pass; zero errors                         |
| Strict TypeScript (`npx tsc --noEmit --strict`)                            | pass                                      |
| Application build (`npm run build`)                                        | pass                                      |
| Repository lint (`npm run lint`)                                           | pass                                      |
| Formatting validation (`npm run format`)                                   | pass                                      |
| Whitespace (`git diff --check`)                                            | pass                                      |
| Changed-file private-value scan and source review                          | pass                                      |

The initial unit run preceded manifest synchronization and failed only the expected
migration-drift check; the complete rerun passed. An exploratory `tsc -b --strict`
command used incompatible flags; the correct strict command and strict configured
build both passed. An initial DB lint overlapped the webhook test's committed
helper schema and reported its unqualified temporary fixture table; the final
clean reconstruction removed that test-only schema and lint passed. No production
code or test assertion was weakened to make these checks pass.

Raw local logs are retained outside the repository under
`%TEMP%/paddle-retirement-*` (upgrade, DB, unit JSON/log, webhook races, reset,
DB lint, strict types, build, lint, and format). No private staging values were
read or copied. The changed-file scan covered private keys, JWTs, secret-key
prefixes, private Paddle entity references, hosted Supabase project references,
and literal UUIDs. Synthetic identities are generated at runtime.
Protected hosted `quality` and `smoke-e2e` checks are required on a future PR;
they have not run for these uncommitted changes. No staging E2E was run.

### Exact changed files

1. `config/staging-commercial-certification.json`
2. `docs/paddle-checkout-certification-fixture.md`
3. `docs/staging-commercial-deployment-manifest.md`
4. `docs/paddle-certification-retirement-verification.md`
5. `scripts/test-paddle-cert-retirement.py`
6. `supabase/migrations/20260922094541_paddle_certification_fixture_authority_retirement.sql`
7. `supabase/tests/fixtures/paddle_certification_before_retirement.psql`
8. `supabase/tests/paddle_checkout_certification_fixture.sql`
9. `supabase/tests/paddle_certification_authority_retirement.sql`
