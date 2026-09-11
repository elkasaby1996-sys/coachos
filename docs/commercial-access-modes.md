# Commercial access modes

PR-PRICE-08 makes the existing subscription access modes authoritative without changing plan prices, capacities, trial dates or individual feature entitlements. The existing `resolve_account_entitlements` remains the commercial source of truth. Provider manual review retains the last valid local contract; scheduled plan changes do not independently change access mode.

| Effective status                    | Mode                                              |
| ----------------------------------- | ------------------------------------------------- |
| No subscription, no owned workspace | onboarding                                        |
| trialing, active, past_due          | full                                              |
| trial_recovery, grace               | existing_delivery_only                            |
| restricted, canceled                | read_only                                         |
| expired                             | none                                              |
| superseded                          | Historical only; excluded from current resolution |

A paid cancellation with a future paid-through end remains active/full under existing reconciliation. When the paid-through date has elapsed, the canonical resolver expires access. A missing subscription with an existing owned workspace is a distinct `owner_recovery_required` data-quality state with read-only behavior and a support path; it is never presented as ordinary expiration or a fresh trial.

## Action matrix

All permissions below remain subject to authentication, existing role/assigned-client authorization, domain validation and capacity admission.

| Action                       | Onboarding                     | Full | Existing delivery | Read only | None    |
| ---------------------------- | ------------------------------ | ---- | ----------------- | --------- | ------- |
| billing_manage               | Yes                            | Yes  | Yes               | Yes       | Yes     |
| account_security             | Yes                            | Yes  | Yes               | Yes       | Yes     |
| data_export                  | Yes                            | Yes  | Yes               | Yes       | Yes     |
| remediation                  | Yes                            | Yes  | Yes               | Yes       | Yes     |
| workspace_read               | No                             | Yes  | Yes               | Yes       | No      |
| delivery_write               | No                             | Yes  | Yes               | No        | No      |
| business_configuration_write | No                             | Yes  | No                | No        | No      |
| acquisition_write            | No                             | Yes  | No                | No        | No      |
| capacity_growth              | First-workspace exception only | Yes  | No                | No        | No      |
| client_self_service          | Yes                            | Yes  | Yes               | Yes       | Yes     |
| client_coached_read          | History                        | Yes  | Yes               | Yes       | History |
| client_coached_write         | No                             | Yes  | Yes               | No        | No      |

Existing delivery includes established client relationships, messaging, assignments, check-ins, workout/nutrition/habit/progress submissions and private delivery templates. Client reassignment in limited delivery requires already-active staff and relationships. New clients, invitations, public acquisition, packages and business settings remain restricted even where a capacity delta would be zero.

## Owner, workspace and client boundaries

The owner summary derives identity from `auth.uid()`. Workspace summaries authorize the caller first and resolve the workspace owner's billing account. An expired personal account does not block a full shared workspace. Each workspace query is keyed by both authenticated user and workspace. There is no global commercial provider or startup dependency.

Client service modes are `interactive`, `existing_delivery`, `read_only` and `unavailable`. Responses retain historical reads, independent self-service and marketplace browsing. They never include coach plan, price, capacity or payment state. Relationship submissions resolve their actual client/assignment ancestry, independently of other relationships. Personal nutrition templates and plans use the existing `owner_client_id` contract; standalone client data and client-owned medical records remain self-service. Coached habit/progress logs attached to a relationship remain coached writes.

Locally mounted boundaries retain existing layouts and navigation. Full access keeps current UI. Limited delivery shows a persistent recovery banner and restricts acquisition/settings controls. Read-only pages retain content while ordinary form controls are disabled. Expired/onboarding product routes show a recovery shell; onboarding retains first-workspace bootstrap. Account settings and Billing remain accessible, with integrations restricted. Client notices and submission controls apply contextually, leaving the independent app available. Failed access checks have a retry state, not an expiration label.

Billing includes explicit review-and-confirm reducing actions for client relationship removal, member suspension, invitation revocation and package archival. Existing role/domain RPCs perform those actions. No automatic remediation occurs. Security, support/privacy/export requests and sign-out remain available. Existing authorized transfer and workspace closure flows retain server access; this PR does not invent a new destructive transfer/closure workflow.

## Public acquisition

Public profile/marketplace reads require stored publication preference, existing listed-profile rules and current full access. Marketplace discovery also requires the stored marketplace-visible preference. Neither access loss nor restoration rewrites those preferences. A direct application checks current owner access server-side before creating a lead. Rejection uses `PUBLIC_COACH_NOT_ACCEPTING_APPLICATIONS` and “This coach is not accepting new applications right now.” Service failures retain a distinct retry message.

See [security](commercial-access-security.md), [write inventory](commercial-access-write-inventory.json), [test runbook](commercial-access-test-runbook.md), and [verification](pr-price-08-verification.md). Feature-key gating, paid seats, quantity billing, refunds, coupons, invoice-list UI, client payments and live deployment remain deferred.
