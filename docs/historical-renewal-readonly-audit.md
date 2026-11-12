# Historical renewal audit — read-only

Inspected November 12, 2026 from `Ahmed-billing` HEAD `ad42b8b`, without changing,
replaying or reconciling any historical subscription/payment/operation. The audit
target was the retained data in staging project `dgogugyuyfourdttvwuy`.

## Attribution and environment

The request did not identify specific subscriptions. H1 and H2 below are the
only two retained Paddle `subscription_recurring` transaction-completion events
found in this project. Their identity as the user's particular “main renewals”
awaits confirmation; do not extrapolate this audit to unidentified subscriptions
or another deployment. Public evidence uses synthetic aliases; private provider
references are not copied into this report.

Both have `provider=paddle`, `environment=test`, authenticated-provider webhook
receipts and `billing-proof-v2` / `paddle-contract-v1` evidence. They are sandbox
transactions, not evidence of live production revenue.

`origin/main` remains `9089060489295c7ce36d6798c283a2ad9d2141bf` (October 10,
2026). Its source contains the older **186-migration Paddle v2 implementation**:
sandbox-only checkout configuration, sandbox webhook configuration and merchant
checkout links. The later 187/188 multi-plan/realm/portal implementation and
189th zero-authorization completion patch are on Ahmed-billing. A branch name
does not establish the environment, and a webhook receipt does not prove the
exact historical frontend or Edge deploy SHA. Earlier journal entries record
that the staging Netlify site served main before its branch switch; this audit
does not independently reconstruct every historical deployment setting.

The project also retains six **Lemon Squeezy/test** subscriptions and 20
processed `subscription_payment_success` deliveries. These belong to the older
Lemon Squeezy billing implementation, not Paddle. Event count alone does not
establish 20 renewals, invoice quantities or a current Paddle capability. No
other remote project's billing records were queried or changed.

## Renewal lines, quantities and limits

The comparison uses retained authenticated normalized transaction/subscription
observations, not newly downloaded Paddle invoice PDFs or merchant API invoices.
The project has no persisted invoice table. Full invoice retrieval remains an
evidence gap, especially for H2's unretained total.

| Observation                                        | H1 — October 23                                                                 | H2 — October 27                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Completion time (UTC)                              | `2026-10-23T10:02:14.401205Z`                                                   | `2026-10-27T19:30:07.484570Z`                                         |
| Origin                                             | `subscription_recurring`                                                        | `subscription_recurring`                                              |
| Service period (UTC)                               | Oct 23–Nov 23 at `10:01:34.296820`                                              | Oct 27–Nov 27 at `19:29:31.405679`                                    |
| Retained recurring lines                           | One mapped Growth monthly base item, quantity 1, USD 59.00 unit price           | One mapped Growth monthly base item, quantity 1, USD 59.00 unit price |
| Recurring extra-seat quantity evidenced            | Zero: no separate coach-seat item in the retained list                          | Zero: no separate coach-seat item in the retained list                |
| Retained payment totals                            | USD 64.24 total and paid, zero balance; separate financial/tax breakdown absent | Payment totals and financial breakdown absent                         |
| RepSync approved extra seats                       | 0                                                                               | 0                                                                     |
| Evaluated effective plan / included coaches        | Growth / 2                                                                      | Growth / 2                                                            |
| Evaluated seat and growth-admission limits         | 2 / 2                                                                           | 2 / 2                                                                 |
| Canonical paid-period end still stored             | `2026-10-23T10:01:34.296820Z`                                                   | `2026-10-27T19:29:31.405679Z`                                         |
| Renewal transaction and paired subscription update | Both deferred                                                                   | Both deferred                                                         |
| Financial renewal application for the transaction  | 0                                                                               | 0                                                                     |

For both, the inspected runtime entitlement reader returned active/full access.
The capacity/entitlement functions were inspected before evaluation and run in a
database `BEGIN READ ONLY` transaction; no locking authority/preparation helper
or reconciliation command was called.

H1's raw canonical row still references Scale, but a retained, provider-applied
Scale→Growth reduction is scheduled at the October 23 boundary. Read-time plan
resolution correctly selects Growth and two included coaches. The raw Scale
row's five included seats must not be reported as its evaluated current limit.
The plan operation remains scheduled and the canonical period has not advanced.
This does not establish a fully reconciled renewal or finalized plan operation.

The retired Lemon Squeezy cohort is distinct: one stored Scale subscription has
quantity 2 and one approved additional coach seat; the other five have quantity
1 and no approved extras. Those legacy quantity semantics are not proof of
Paddle's separate USD 12 recurring coach-seat item. Their provider invoice line
amounts were not independently retrieved in this audit.

## What the observations prove

- Paddle sandbox delivered authenticated observations reporting two completed
  recurring transactions and paired active subscription-period observations.
  H1 also retained positive paid totals and zero balance. Direct current
  merchant transaction/invoice retrieval and captured-attempt inspection were
  not performed, so that stronger provider-side verification is still open.
- The retained recurring line sets describe Growth base subscriptions without
  extra-seat items. Current evaluated limits are consistent with two included
  Growth coaches and zero approved extras.
- Provider collection and application reconciliation are different stages. Both
  renewal completions and their paired updates are deferred, with no recorded
  error explaining the full cause and no consumed renewal application. The
  canonical periods remain at the old boundaries. No replay was attempted to
  force an answer or change that history.

They do **not** prove recurring extra-seat charging, current Ahmed-billing's
end-to-end renewal/recovery flow, duplicate-renewal collection protection,
renewal invoice PDF accuracy, all historical subscriptions, or live production
billing. Missing retained fields cannot be reconstructed as authenticated facts
from a later source version.

## Preservation and remaining evidence

A 74-record snapshot of the older Paddle subscription/canonical/item/payment/
event/observation cohort, excluding the two current protected/test owners,
remained byte-identical across the audit, fingerprint
`333411ccd0fc65a015cfb6df4fda782691869fe7762b58bbae6f6623de58e617`.
All audit queries were SELECTs or explicit read-only transactions. No historical
auth session, portal creation, payment-setting change or provider mutation was
performed.

To expand the audit, identify any different intended subscriptions and obtain
read-only merchant invoice/transaction evidence, including full line items,
amounts/tax, captured attempts and environment. Use scoped read capability or an
authenticated merchant session only when needed; never send API keys in chat.
Any later history remediation/replay is a separate authorized change and is not
part of this audit. The [roadmap](billing-release-roadmap.md) keeps current
renewal and failed-payment recovery certification open.
