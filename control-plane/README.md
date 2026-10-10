# Local replay-ledger candidate — BILL-04C/r2

This directory is a separate PostgreSQL control-plane database. Its migration
must never be applied to RepSync/Supabase. It introduces no admission service,
executor, credentials, operational enrollment or application caller.

The source baseline is merged main `1414867cc28419046f6a32aae1316cb9a267206e`,
tree `86c44de4d3b14f53e288b575d9bdce2d1e44ddab`. BILL-04A Closure Addendum r1
and the unchanged V2 contracts govern this candidate.

## Boundary

All repository results remain `operational:false`, `executionEligible:false`.
The injected PostgreSQL query client has no connection URL or generic-command
API. It must use a restricted database principal. The repository imports the
existing V2 signature, intent, slot, graph and lifecycle validators unchanged.
The query adapter must complete each method's transaction/COMMIT before
acknowledging success; it must not return an uncommitted result from a surrounding
caller transaction. Mutations request synchronous WAL acknowledgement. Durable
deployment also requires PostgreSQL `fsync` and `full_page_writes` enabled and
reliable storage; this does not protect against administrator rollback or loss
of the ledger and its independently retained history.

Claims require an exact, private admission permit and current epoch, policy,
boot challenge and authoritative head. Advancing requires a separate private
transition permit, verified retention graph and the exact persisted claim.
Runtime cannot mint either permit, mutate enrollment, write private tables or
clear ownership. Supplied booleans never supply approval, fencing or custody.

**Only synthetic authority is implemented.** Test-owner fixtures insert permits
directly in their disposable database. SQL rejects other authority modes and
database namespaces. A signed document or matching caller-provided epoch alone
cannot authorize a claim. These test fixtures must never be enrolled/deployed
as operational authority. Future authenticated admission/custody/epoch services
must independently enforce all technical deadlines and finalized evidence;
neither the ledger nor a test permit authenticates those external facts.

## Records and transactions

| Record                 | Enforcement                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `consumptions`         | Permanent operation/claim ID; globally unique nonce, action digest and permit; unique repository/environment/run/attempt/phase/mode slot |
| `target_ownership`     | Separate partial unique index across reserved, owned and quarantined dispositions for the same project/organization                      |
| `operation_states`     | Serialized lifecycle revision, retained-ack digest and database-maintained reservation count                                             |
| `command_reservations` | Permanent operation/sequence key, exact permitted command/artifact digests; contiguous sequence starting at one                          |
| `audit_events`         | Per-operation ordered sequence and domain-separated predecessor/hash chain; fixed outcomes and sanitized identities only                 |
| `control`, `epochs`    | Default disarmed, boot/epoch/policy/head binding and revocation; no runtime arming endpoint                                              |
| Private permits        | Exact synthetic admission and retention-stage bindings; inaccessible to runtime                                                          |

The claim function performs epoch/revocation/deadline checks, nonce/slot
consumption, ownership acquisition, pending-retention state and audit insertion
in one PostgreSQL transaction. Constraint conflicts abort every write. All
mutating functions lock the control row first, then operation state; this
intentionally serializes the small control-plane workload. Status shares that
boundary for a coherent read. No process-local lock or uniqueness cache exists.

`claim`, `advance`, `reserveCommand`, `stop`, `status` and `disarm` are the only
repository methods. `advance` supports retention-confirmed and running only.
No credential read, executor handoff, target request or dispatch exists here.
A command reservation records an irreversible reservation, not dispatch success
or permission to execute. No SQL, shell, URL, filename or executable command is
accepted as a plan.

Only `RUNNING`, retained, owned fixed mutation/backup operations can reserve
commands. Read-only capture, measurement, status, inspection and release
preflight cannot reserve mutation commands. The immutable admission permit must
contain the exact sequence/command/artifact tuple. Future fixed-plan generation
and authenticated executor integration remain separate work.

## Failures, fencing and recovery

Failure/revocation/unknown outcome/retention failure remain consumed and
quarantine an exclusive target. Lease expiry never releases it. Stop/disarm
remain possible after expiry, without granting capability. Late acknowledgements
cannot reactivate terminal states. Query an uncertain claim/reservation outcome;
never automatically resubmit, redispatch, replace authorization, repair or resume.

There is deliberately **no success/release/quarantine-clear endpoint**. Final
retention, process fencing, termination, cleanup and reconciliation are not
implemented. Until a future reviewed authority supplies these proofs, ownership
stays quarantined. `RELEASED` is a reserved storage disposition, inaccessible to
runtime transitions in this candidate.

`RECOVERY_INSPECT` consumes its own nonce and slot and binds a quarantined
operation/action/target plus a privately installed synthetic fencing evidence
digest. It acquires no writer row and cannot reserve commands or release the
prior owner. Real fencing and provisional inspection of still-running remote
requests remain future executor responsibilities.

Restoration must disarm **before exposing the instance**. `disarm` quarantines
all unresolved operations without erasing tombstones. An authoritative epoch
head and fresh boot challenge must be held outside the restorable database;
they are not implemented by this repository. Tests maintain that authority in a
separate explicitly synthetic fixture and reject restored/stale heads. New epoch
records do not delete prior consumptions or quarantine. New admissions require
runs created after activation. Missing tombstones/history must be reconciled
from independently retained evidence before arming; they cannot be regenerated
from hashes or assumed absent.

A standalone PostgreSQL snapshot cannot detect every rollback of itself. The
test restore helper disarms automatically, but this does not demonstrate a real
host installation/restoration supervisor or independent disaster recovery.

The audit chain detects inconsistencies against retained chain heads; it is not
external WORM, authenticated execution evidence or independent retention. The
database administrator remains trusted and can change schema/restore data.
Ordinary runtime and owner UPDATE/DELETE of tombstones/audit/reservations reject.

## Offline verification

```powershell
npx --no-install vitest run --config control-plane/vitest.config.mjs --configLoader runner
npx --no-install vitest run --configLoader runner tests/unit/staging-founder-authorization-v2.test.ts tests/unit/staging-founder-governance.test.ts --maxWorkers=1
npx --no-install eslint control-plane
npx --no-install prettier --check control-plane
node --check control-plane/src/replay-ledger.mjs
node --check control-plane/tests/disposable-postgres.mjs
npx --no-install tsc --noEmit
npm run staging:commercial:validate
node scripts/validate-billing-retirement.mjs
```

The new suite requires the already cached immutable PostgreSQL 18 image
`postgres@sha256:7e32e9833a6fb1c92c32552794cb6ed569d51b445a54907d35fc112ef39684db`.
It never downloads an image. Each run creates a labeled, randomly named
container/database, disables networking, publishes no ports and mounts no host
directories. It uses a new empty temporary Docker config and reads no .env or
credential files. Unknown/local/remote caller database URLs all reject.
Existing application and reconciliation containers are never selected.
Creation verifies the owner label and isolation, then all queries use the exact
immutable container ID. Reusing its former name cannot redirect a query.

Independent `docker exec psql` processes use distinct PostgreSQL sessions and a
restricted test login for repository queries. Privileged setup/probes run only
inside this owned disposable container. Fixture snapshots are held in memory
and contain synthetic data only. Cleanup validates ownership/isolation before
removing the test container/anonymous volume and its unique empty-config folder.
Abrupt termination may require explicitly identifying and removing the labeled
test resource; cleanup is not crash-proof. New-container setup has a bounded
30-second test hook; individual tests retain Vitest's default timeout. These are
test harness deadlines, unrelated to the unchanged release observation clock.

No new dependency or application package/lockfile change is needed: the
repository accepts a standard parameterized `query(text, values)` interface;
the offline test adapter uses the PostgreSQL tools in the pinned container.

Operational GitHub authentication, private retention/export, epoch custody,
executor fencing, scoped credentials, installation/recovery and final combined
review remain prerequisites. This candidate does not begin BILL-04D/r2.
