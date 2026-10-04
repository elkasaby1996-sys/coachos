# PAY-04 billing boundary and annual activation

RepSync is pre-launch. Paddle is the current replaceable payment integration,
not the billing domain. LS execution and application database authority remain
retired; historical schema and ownership evidence remain inert.

## Narrow migration 186

`20261004065506_paddle_catalogue_activation_boundary.sql` enables trusted initial
activation for Launch, Growth and Scale, each monthly or annual. It updates the
existing proof, initial item guard, idempotent activation and period installer;
it does not create a parallel subscription or payment model. Provider, sandbox
environment, currency, catalogue mapping, account attribution, quantity one,
settled transaction, subscription identity, canonical ownership and cross-ledger
conflict checks remain server-owned and fail closed. Initial additional seats
retain the existing zero-seat activation scope; subsequent seat changes are
unchanged. No runtime flags, data backfills or table changes are included.

Annual activation requires authenticated transaction period evidence and a
trusted catalogue `year × 1` interval without a provider trial. Actual period
dates are retained. Validation uses UTC calendar-year conventions, including
leap days, not twelve-month or fixed-day approximations. Missing/contradictory
annual period evidence cannot activate paid authority. Monthly behavior and its
existing incomplete-period compatibility remain unchanged.

Migrations 1–185 are not modified by PAY-04. In particular, migration 185 stays
exclusively the reviewed LS database-authority retirement migration. Manifest
and future preflight bind all 186 hashes and the exact authorized pending suffix.

## Replaceable boundary

| Ordinary RepSync domain                                             | Integration boundary                                            |
| ------------------------------------------------------------------- | --------------------------------------------------------------- |
| Plan, cadence, seats, authorization and safe state/result contracts | Paddle transport, API mechanics and webhook translation         |
| Plan/seat actions through capability ports                          | Adapter-specific workflow implementation and factories          |
| `billing_paid_state_v1` entitlement/capacity projection             | `billing_paddle_paid_state_v1` canonical evidence normalization |
| Generic payment-method continuation and safe recovery concepts      | Paddle transaction format, SDK/environment validation           |
| Generic checkout plan/cadence/legal request                         | Current browser adapter, endpoint and approved checkout host    |
| `billingTreatment` immediate/deferred concepts                      | Paddle proration vocabulary and frozen legacy-wire translation  |

Explicit current-provider registration is intentionally narrow and fails closed
for missing, unknown or retired identities. A replacement requires an adapter,
webhook translator, credentials/catalogue mappings and provider-specific
mutation implementation, plus a reviewed registration/SQL dispatcher extension.
It does not require rebuilding catalogue, entitlements, authorization, ownership,
seat/client/workspace limits or ordinary UI workflow semantics. Provider-specific
persisted external identity and evidence remain at their integration boundary.
No simultaneous multi-provider infrastructure is introduced.

Five generic import-isolation tests protect auth, theme, routes, callback and
login bootstrapping. Additional boundary tests prevent concrete transport imports
in ordinary contracts/plan/seat panels and verify adapter translation.

The strict client entitlement contract accepts the server's `billingUnavailable`
flag without treating it as access authority. A true flag is valid only for a
paid, restricted/read-only projection with zero capacities and no features.
Checkout and plan/seat controls are withheld for that denied state. Null or
missing workflow providers can represent only an unavailable, non-paid state;
they cannot grant a preview or mutation capability.

## Product and remote boundaries

Scheduled plan/seat cancellation is intentionally unsupported: HTTP409
`BILLING_PLAN_CHANGE_CANNOT_CANCEL` / `BILLING_SEAT_QUANTITY_CANNOT_CANCEL`,
without provider mutation. Subscription cancellation and undo scheduled
subscription cancellation/resume remain separate product gaps.

Local SQL/unit/browser/concurrency evidence is not remote Paddle certification.
Remote LS execution is not assessed. Paddle live readiness remains blocked by
the sandbox-only runtime; future configuration, deployment and certification
require separate authorization. See the [certification matrix](paddle-only-certification.md).
