PAY-03B pre-launch retirement - historical engineering evidence

These files preserve the former LS integration and forensic-classifier tests.
They are not active launch certification and are outside supabase/tests.
No R1/R2/R3/R4 reviewer artifact is overwritten or discarded.
The committed history and PRELAUNCH_RETIREMENT_IMPL_01_BASELINE snapshot also
retain the original migration 185 and all pre-retirement candidate bytes.

The current migration 185 retires ACLs and shared authority without deleting,
updating, reclassifying or migrating historical rows. It installs no financial
closure classifier. Native functions remain owner-only historical internals.
Shared classification, history preservation, canonical origins, cross-ledger
conflicts, Paddle/PAY-02 and generic trial/free capacity assertions remain active.

fixtures/lemon_squeezy_retirement_history.psql is used only to populate the
immutable migration-184 boundary in the upgrade proof. It is not an application
capability or a requirement to operate LS after retirement.
Runtime and DB authority proofs are local only. Remote execution, zero-obligation
inventory, backup/reset, tombstone deployment, secret removal and Paddle-only
remote certification remain separately authorized future gates.
