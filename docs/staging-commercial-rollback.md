# Staging commercial rollback and cleanup

No rollback operation ran in Phase A. `config/staging-commercial-rollback.json` contains ten strict, complete operator templates. Each requires separate authorization naming resources, an assigned release owner, prerequisites, actions and verification. Every template preserves commercial/provider history.

| Template                | Trigger and response                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| application             | Revert to an explicitly reviewed compatible app SHA/build; verify auth, historical delivery and recovery.                                                                       |
| edge-functions          | Redeploy only named affected functions from a previous compatible reviewed revision; verify JWT/signature behavior.                                                             |
| compensating-migration  | Obtain backup restore proof, write and locally test a new forward correction, then request authorization. Never edit deployed migrations or create destructive down migrations. |
| mapping-retirement      | Stop new sales through an incorrect mapping while retaining historical contracts and subscription reconciliation.                                                               |
| webhook-disablement     | Assess pending retries first, disable only the approved test webhook, record the disabled window and plan replay/reconciliation before restoring it.                            |
| secret-rotation         | Review upstream and consumer order, rotate privately, verify the new credential before revoking the old one; record names only.                                                 |
| pending-retries         | Pause new synthetic actions, respect leases and ambiguous states, reconcile provider authority and assign manual-review obligations. Never blindly resend a purchase.           |
| synthetic-users         | Revoke sessions and disable isolated synthetic logins; remove only approved disposable domain fixtures after resolving obligations. Preserve billing references.                |
| provider-test-resources | Cancel approved test subscriptions and archive test access where supported; preserve provider/commercial history and invoice obligations.                                       |
| evidence-retention      | Delete transient raw captures, expire safe artifacts after seven days and retain only approved aggregate sign-off.                                                              |

Do not use the generic backup or migration-status workflow during Phase A. A later backup approval must account for database roles/schema/data and any relevant Storage objects; a dump existing is not proof of restore. Never publish a backup in the certification artifact bundle.

For CERT-ROLLBACK-001 record the approved previous revision, private backup evidence digest, safe before/after assertions, residual retry ownership, and cleanup completion. Do not mark it passed based only on the completeness of these templates. If rollback cannot preserve pending obligations or schema compatibility, stop new test activity and escalate to the designated owner. Production remains outside this procedure.
