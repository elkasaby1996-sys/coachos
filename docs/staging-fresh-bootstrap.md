# Fresh staging bootstrap

This is a source-reviewed exit from irrecoverable historical evidence. It creates
no exemption, waiver, historical rewrite, classifier exception or release authority.
The prior staging project remains preserved. This tooling does not create a project.

## Fixed scope and current disarmed state

The reviewed source is `d08a4ecd153da3425f8b09a3a315360a5ee23b06`, tree
`005a7c096d7476c980dcbde4a0b6d703757c6643`. Its 740 protected files, all 186
migrations and final Edge/application source remain the billing payload.

`config/staging-replacement-target.json` deliberately has `replacement: null`.
The old staging and production refs are unconditional deny targets in bootstrap,
the v3 release boundary and staging logical backup. There is no environment
variable override. All three protected CLI entry points refuse an unset registry.
A later separately reviewed source change must name the exact
replacement project and HTTPS application origin. Once configured, the registry
also restricts release/backup to that project. Existing GitHub variables do not
override it. Production is never queried.

The only new executable migration phase is `EMPTY_TO_180`. No arbitrary target,
bootstrap resume, seed import, function deployment, secret mutation, project creation
or provider request is supported. A disposable directory holds exactly canonical
migrations 1–180 and canonical configuration. All normalized hashes, filename order,
configuration identity and ancestor path boundaries are verified before execution.
Canonical migrations are never moved or hidden. Cleanup removes only the generated
temporary directory. Migrations 181–186 cannot enter this artifact.

## Sequence and authorization boundaries

1. **PLAN (local):** `npm run staging:bootstrap:plan`. This validates source and
   prints the fixed artifact identity. It neither reads a remote nor issues authority.
2. **Separate infrastructure preparation:** obtain explicit authority to create an
   isolated replacement project and configure it. Preserve old staging; copy no Auth
   users, accounts, subscriptions, checkouts, events, reservations, fixtures or
   provider identities. Review the exact target registry change and execution commit.
3. **Empty-project inventory:** a separately authorized read-only operator uses
   `createBootstrapObserver` against that exact project. Its output binds the fresh
   inventory used by the independently reviewed bootstrap envelope. No ordinary
   release observer is used before schema 180: it assumes billing tables exist.
4. **PREFLIGHT:** the new protected manual `Supabase Staging Empty Bootstrap`
   workflow accepts only main and checks the dispatched SHA, clean checkout,
   pinned-source ancestry, exact confirmations and source-reviewed target registry.
   It validates a strict schema-version-1 bootstrap envelope in
   `STAGING_BOOTSTRAP_AUTHORIZATION`. This envelope cannot be reused as v3 baseline
   or cutover authorization. It binds the actual commit, target/origin and deny
   targets, whole policy, full manifest, bounded artifact, protected payload,
   final/containment source, checkpoint contracts and inventory. Its lifetime is
   at most 30 minutes; reviewed inventory must remain within 15 minutes. No backup
   is substituted: this operation requires positive empty-project proof and no
   imported history. Every writer/ingress exclusion is an explicit operator
   attestation lasting beyond the envelope. Exclusions must actually be established.
5. **APPLY, separately authorized later:** exact empty observation, bounded link
   and dry-run listing precisely 1–180, complete fresh empty observation, exact
   artifact/source/authority validation, then one bounded push. No function is
   deployed. Opening time governs the unchanged 60-second budget across both
   snapshots and final metadata confirmation. Local validation time is included.
6. **CHECKPOINT 180:** require exact ledger, reviewed SQL/ACL/RLS contract, policy
   flags false, no functions, no work/scheduled operations, empty classifier result,
   and empty Auth/public history except the six canonical reference tables seeded
   by migrations. CLI success alone is insufficient. Evidence contains safe
   counts/digests/statuses, never credentials or raw provider data.
7. **Initial configuration/function handoff:** prepare and independently verify
   the configuration below; separately authorize installing the two frozen
   nonbilling artifacts before containment. Bootstrap itself provides no function
   deployment authority. Take the fresh 180 backup/restore proof only after this
   preparation and a verified write/ingress exclusion window.
8. **Existing v3 baseline:** new inventory, full config/mapping attestation,
   recovery bundle and independent `BASELINE_180_TO_184` authorization. The
   historical-drain classifier remains unchanged; an empty project needs an empty
   review, not historical exemptions. Verify 184, then obtain a fresh 184
   backup and restore proof before a new cutover envelope.
9. **Existing v3 cutover:** containment, drain, 185, retirement proof, 186, final
   billing/nonbilling deployment, final verification. Preserve all current expiry,
   retry, ACTIVE/JWT/source identity, history, fresh observation and resume gates.

The bootstrap, backup and release workflows share `supabase-staging-commercial`
with cancellation disabled. This excludes those workflows only; it does not lock
manual SQL/CLI/dashboard operators, application traffic, schedulers or providers.

## Initial function/configuration handoff

No active billing Edge function is needed for empty bootstrap or baseline. Final
billing functions must wait until 186. The existing containment verifier requires
all 16 manifest names to exist: **`open-wearables` and `exercise-dataset-search`
must already be deployed and verified** before containment completes. Their
installation is a separate, narrowly authorized preparation action. Both require
JWT verification and ACTIVE status. Downloaded closure digests must match the
reviewed source; a version increase is insufficient. `initialHandoff()` exposes
this missing prerequisite and deliberately never certifies release readiness.

Bootstrap binds secret metadata and the complete Auth digest for stability; it
does not claim credentials work and does not require provider credentials to
execute static schema. The existing v3 baseline has the stricter full-deployment
configuration contract. Before its inventory/backup/authorization handoff, require:

- `PADDLE_ENVIRONMENT` attested sandbox; sandbox API, dedicated checkout,
  payment-method and webhook credentials; sandbox payment page; checkout disabled.
- Frontend sandbox client-token presence/attestation, shared function configuration,
  staging site URL and exact callback allowlist, enabled signup with confirmation
  required as specified by v3. Keep all frontend/operator access externally excluded.
- Fresh test catalogue mappings bound to the new database's canonical IDs. Do not
  copy old provider/customer rows or recycle evidence tied to the old project.
- Verified webhook/provider isolation, disabled sales/reconciliation and isolated
  certification drivers. A new callback URL on the same provider account does
  **not** prove isolation from old subscriptions/events. Unknown isolation blocks.

No real backup, restore, configuration, function handoff or release authority is
created by this local implementation or rehearsal. Recovery evidence remains a
separate fresh backup plus actual local restore proof, including complete ledger
rows. Successful bootstrap is not commercial certification or permission to buy.

## Whole-phase timing gate

The 60-second window covers each complete observation, not an entire release.
The existing baseline uses four observations. Full cutover uses at least **129**:
30 function deployments each require four, two migrations require three each,
plus initial, drain and final gates. Optional outside artifacts add two each.
CLI/deployment/download/probe and local-validation time is additional. The
authorization lasts at most 30 minutes and the workflow at most 45 minutes.
Crucially, v3 also rechecks the original reviewed inventory and configuration
attestations against their **15-minute** maximum age at each gate. Their remaining
lifetime can therefore be the tighter whole-phase bound. Backup expiry, quiet-window
end and quality work before apply further reduce the available wall-clock budget.

`phaseWorkload()` and `phaseTimingAssessment()` calculate this workload without
changing the runner or any budget. Require at least three real complete-observation
measurements on the replacement, conservative nonzero mutation/local allowances,
actual remaining authorization/job/inventory/configuration/recovery/quiet-window
times and 25% margin. A per-observation pass is
not a phase pass. Historical 42–45-second observations imply over 90 minutes for
129 observations alone and therefore **block cutover**, despite fitting 60 seconds
individually. Local SQL timings do not establish replacement-project performance.

This assessment is a required operational pre-authorization gate, not a claim of
measured remote capacity. If fresh-project measurements do not fit, stop for a
separate reviewed batching/performance proposal; do not extend expiry/freshness,
skip checks or rely on repeated partial failures/resume to finish a planned phase.

## Failure and recovery

Any precondition/drift/expiry failure stops before the push. A failed or interrupted
push may leave an actual partial ledger. The report records the observed count
where readable, otherwise unknown; it never infers success from CLI output.
There is no automatic retry, rollback, ledger repair or bootstrap resume. Counts
1–179, unknown states or 180 with a failed checkpoint require new observation and
independent recovery design. An exact verified 180 proceeds only through the existing
separately authorized baseline. Do not delete/recreate a project as automatic recovery.

## Offline verification

`npm run staging:bootstrap:test` uses real observer/runner code with synthetic
read-only transports and intercepted mutation commands. Drift cases require zero
mutation calls; a stable control must reach exactly one bounded push.

`npm run staging:bootstrap:rehearsal` requires `PAY05_LOCAL_SUPABASE_CLI` pointing
to an already cached 2.109.1 executable and the fixed disposable
`repsync_reconciliation01` container/workdir. It strips remote credentials, disables
telemetry/keyring use, accepts no remote URL or arbitrary container, and invokes
only `--local` commands. It resets only that disposable database, cold-installs
1–180, then checks 184/185/186, empty history/drain, flags, ACL/RLS and LS retirement.
It never downloads a CLI or container image, and leaves failed local state observed
without repair. Generated artifact copies are removed; the canonical source is untouched.
