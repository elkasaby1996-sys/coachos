# Read-only production zero-LS-obligation gate

Not executed. Founder locks: RepSync has not launched; no real production customers/payments/paid subscriptions/LS obligations. Do not invent a legacy-customer migration. Future inspection tests that operational fact and remote state, not an arbitrary historical financial classifier.

Bind separately authorized production project/origin, exact reviewed commit, observed UTC time, ledger and read-only transaction/snapshot. No staging target, providers, secret values, DML, helper installation, cleanup or provider requests. Keep raw identities/private evidence outside logs; publish counts and static verdict only.

## Physical roots: all statuses and all environments

| Root                                            | Source                                                                                               | Expected production count |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------- |
| LS provider customers                           | billing_provider_customers                                                                           | 0                         |
| LS subscriptions, including terminal/synthetic  | billing_provider_subscriptions                                                                       | 0                         |
| LS checkout attempts, all statuses              | billing_checkout_attempts                                                                            | 0                         |
| LS plan operations and events                   | billing_plan_change_operations; billing_plan_change_events                                           | 0 each                    |
| LS seat operations and events                   | billing_seat_quantity_operations; billing_seat_quantity_events                                       | 0 each                    |
| LS webhook deliveries, pending/failed/processed | billing_provider_webhook_deliveries                                                                  | 0                         |
| LS current or historical canonical origins      | billing_canonical_origins storage_contract=lemonsqueezy.v1                                           | 0                         |
| LS-linked active/current account state          | account_subscriptions/accounts joined by physical LS link or LS canonical origin                     | 0                         |
| Unresolved payment/invoice/work evidence        | LS subscription snapshots, webhook retained evidence and nonterminal checkout/plan/seat roots        | 0                         |
| Attribution/conflict anomalies                  | unsupported/orphaned/cross-account origins, physical LS↔v2 links and unproven current paid authority | 0                         |

Do not filter roots to active, test=false, well-formed or matched records. Terminal rows and test-mode rows in production are unexpected and require investigation. Keep unknown status/environment/attribution as unknown/blocking. Shared-v2 provider roots that identify LS must also be counted; unsupported provider identities stop. Static store/catalogue/variant/quantity mapping configuration is not a customer obligation and is reported separately, not added to root counts.

The fixed read-only tool query records native roots plus full function/ACL/schema and policy metadata. Operator review additionally records status/environment distributions, LS-linked active state, shared-v2 LS evidence, unresolved financial/work evidence and origin anomalies. No raw payloads or financial IDs are published. Because every physical LS root is expected zero, any nonzero root already stops; do not build another permanent proof-of-closure engine to waive it.

Production expected result: ZERO_OBLIGATION only when every required count is zero and attribution is complete/known. Any activity, unknown/missing object/permission, unexpected LS/customer/financial link, ledger drift, real-obligation evidence or contrary shared185 history is STOP for bounded read-only investigation. No automatic reclassification, migration, deletion, reset or provider servicing follows.

Production retirement authorization binds the private inventory digest and classification evidence with classificationResult=zero_obligation, fresh production backup/restore proof and reviewed185 suffix. The deployment reader rechecks actual inventory and refuses any physical LS root or incomplete count inventory. Function/JWT metadata, ACLs and provider-disabled flags are checked after apply; independent artifact/response/no-side-effect evidence is still required.

See [production readiness](production-billing-retirement.md). No real commercial release is authorized by a zero count.
