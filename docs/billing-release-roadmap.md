# RepSync billing release roadmap

Updated November 12, 2026. This is an evidence-based roadmap assembled from the
repository and staging results; no additional roadmap text was included in the
request. Statuses apply only to their stated scope and do not authorize a merge,
production change or commercial launch.

Current release path: **Ahmed-billing → staging verification → required review
and release decision → any separately authorized promotion**. Main remains
unchanged. All fixes/deployments must retain the existing `supabase-staging`
environment review and exact payload/source checks.

## Evidence and status

| Area                                                        | Status                                                | Evidence / remaining blocker                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staging backend and bounded SQL patch                       | Passed for deployed sandbox scope                     | [Reviewed patch run 43209598190](https://github.com/elkasaby1996-sys/coachos/actions/runs/43209598190), [patch/test record](payment-method-sandbox-verification.md). Canonical staging ledger has 189 migrations; historical release checkpoints remain pinned to their 188 baseline. |
| Sandbox catalogue and scoped checkout                       | Passed for inspected eight mappings and pilot         | [Readiness/activation evidence](paddle-staging-installation.md), [journal](session-journal.md). This does not certify every plan/cadence checkout combination.                                                                                                                        |
| Initial Growth monthly purchase                             | Passed                                                | [Isolated real checkout and processed initial payment](payment-method-sandbox-verification.md). Zero extras; broader initial plan/seat/cadence matrix still needs hosted evidence.                                                                                                    |
| Additional seat purchase                                    | Passed for the original protected test purchase       | [Retained original paid seat evidence and guard diagnosis](payment-method-scheduled-reduction.md), [journal](session-journal.md). One approved extra, three total coaches; no new action on this owner.                                                                               |
| Future seat reduction                                       | Schedule verified; application at renewal unverified  | [Original reduction](payment-method-scheduled-reduction.md) to zero extras at `2026-12-10T22:23:38.061119Z`. Preserve the operation and paid capacity until its boundary.                                                                                                             |
| Active payment-method update                                | Passed                                                | [Provider success, automatic signed-event completion, exact preparation and unchanged financial ledger](payment-method-sandbox-verification.md).                                                                                                                                      |
| Close → explicit refresh → retry                            | Passed for active payment-method update               | [Reused preparation/transaction/dispatch evidence](payment-method-sandbox-verification.md); no automatic mutation retry. This is not debt recovery or a general duplicate-collection certification.                                                                                   |
| Schedule cancellation and undo                              | Passed on the existing isolated subscription          | [Portal, automatic server processing, persisted UI, full-access and no-new-charge evidence](cancellation-sandbox-verification.md). Original December 12 renewal restored.                                                                                                             |
| Actual end-of-term cancellation/access expiry               | Unverified                                            | [Narrow cancellation-test scope](cancellation-sandbox-verification.md). The schedule was deliberately removed, so no terminal cancellation was observed.                                                                                                                              |
| Custom paused/canceled subscription resume                  | Separate product gap                                  | [Capability distinction](cancellation-sandbox-verification.md), [scenario inventory](../config/staging-commercial-scenarios.json). Portal undo of a future cancellation is supported; it does not reinstate a terminal subscription.                                                  |
| Invoice/portal access                                       | Partial                                               | [Current portal payment and tax summary](cancellation-sandbox-verification.md). Historical invoice PDFs/full merchant invoice data remain an [audit evidence gap](historical-renewal-readonly-audit.md).                                                                              |
| Historical “main” renewals                                  | Provider evidence only; scope attribution provisional | [Read-only audit](historical-renewal-readonly-audit.md). Two retained Paddle/test recurring completions; both deferred in RepSync, zero renewal applications, zero recurring extra-seat items. Not live or current-release certification.                                             |
| Current successful renewal, including recurring extra seats | Unverified                                            | [Historical audit limits](historical-renewal-readonly-audit.md). Need a controlled invoice with a recurring coach-seat item and corresponding processed payment/capacity evidence, not merely base-plan renewal.                                                                      |
| Genuine failed-renewal recovery                             | Blocked / unverified                                  | [Exact blocker and resume procedure](failed-renewal-sandbox-verification.md). Existing isolated renewal is `2026-12-12T10:52:51.618914Z`; accelerated boundaries are unsupported by current authority. Require real failed debt and exact successful settlement.                      |
| Scheduled-reduction/payment-method coexistence              | Intentionally unsupported                             | [Authority explanation](payment-method-scheduled-reduction.md). Do not remove operation checks or cancel the protected reduction to enable the button.                                                                                                                                |
| Replay, delayed delivery and race behavior                  | Local coverage plus limited hosted proof              | [5,216 SQL assertions / race and hosted records](session-journal.md), [payment-method retry](payment-method-sandbox-verification.md). Hosted duplicate financial-renewal collection protection remains unverified.                                                                    |
| Live/production certification and launch                    | Blocked; no production action authorized              | [Release configuration and verification requirements](paddle-billing.md), [scenario matrix](../config/staging-commercial-scenarios.json). Staging/test receipts and a main branch name do not prove live billing.                                                                     |

## Next gates

1. Retain the now-active isolated subscription and unchanged renewal date. Use
   the [renewal-time runbook](failed-renewal-sandbox-verification.md) for genuine
   failure/recovery; do not replace it with SQL status edits or simulated events.
   Successful base renewal, recurring seat quantities and failure/recovery may
   require separately controlled fixtures/outcomes and distinct evidence.
2. Confirm which historical subscriptions the “main renewals” report intended.
   Obtain missing read-only invoice evidence and decide separately how retained
   deferred history should be handled. Do not automatically replay, rewrite or
   apply those records as part of verification.
3. Finish the hosted plan/cadence/seat/invoice/renewal/retry scenarios that lack
   current evidence. Keep cancellation scheduling/undo separate from actual
   expiry and paused/terminal resume. Resolve any demonstrated runtime defect
   on Ahmed-billing, run relevant regressions and deploy only through the
   existing reviewed staging workflow.
4. Recheck preservation hashes, exact source/payload/deployment, provider realm,
   financial applications and access/capacity after each scenario. Do not run
   historical bootstrap/upgrade or fixture-creation jobs against this populated
   project merely to repeat a test.
5. Review all critical blockers and the [certification scenario inventory](../config/staging-commercial-scenarios.json)
   before any release decision. A future main promotion or controlled live test
   requires its own authorization and applicable review; none is performed by
   this roadmap or the current task.
