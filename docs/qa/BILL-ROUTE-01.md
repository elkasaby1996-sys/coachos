# BILL-ROUTE-01

Recommendation: **READY_FOR_COMMIT** after local database/browser validation. Implementation is uncommitted on `codex/billing-pre-workspace-access-01`, based on fetched `main` at `3d959b1692983814447b1f54f65f6137f382689e`.

## Routing audit

1. `RequireAuth` in `src/routes/app.tsx` requires a session; `BootstrapGate` retains loading/error behavior.
2. `src/lib/auth.tsx` resolves bootstrap from normal memberships and PT/client profile lookups. Without a workspace, `ptWorkspaceComplete` is false. Account type can also be inferred from the URL, so account type alone is insufficient for the new exception.
3. `RequireRole` waits for usable bootstrap, then calls `getProtectedRedirect`. Before this change, its PT branch unconditionally executed `if (!params.ptWorkspaceComplete) return "/pt/onboarding/workspace"`. This was the smallest redirect responsible for blocking Billing.
4. `/pt-hub` wraps `PtHubLayout` with `RequireAuth` and `RequireRole allow={["pt"]}`. Billing is nested beneath `settings`, then `billing`.
5. The settings layout has no further workspace guard. `CommercialAccessBoundary` already permits settings recovery routes, but is downstream of `RequireRole`; this existing commercial exception did not bypass the workspace gate.
6. The Billing page reads account entitlements/capacity. The shell's profile/settings hooks read existing rows and return in-memory defaults; they do not initialize rows. The workspace onboarding page is different: it writes profile/identity data on mount. No changes were made to that page.
7. `workspace_account_trial` initializes trial state after workspace creation. No workspace is needed or inserted by the new route policy.

## Behavior

`getProtectedRedirect` now lives beside the existing bootstrap policy in `src/lib/protected-route-guard.ts`. Its sole new exception requires PT account type, a route permitting PTs, and a normal PT profile whose user matches the authenticated user. `isPreWorkspacePtRouteAllowed` uses the router's exact match semantics, including trailing slashes. Query strings do not participate in pathname matching; descendants and sibling settings routes are not exempt.

| Requirement                                   | Result                                                |
| --------------------------------------------- | ----------------------------------------------------- |
| No-workspace PT Billing allowed               | Yes, verified in local browser tests                  |
| Incomplete onboarding allowed for Billing     | Yes; completion is not modified by the decision       |
| Normal PT Hub still blocked                   | Yes in route unit tests                               |
| Account/Security tabs                         | Still redirect to workspace onboarding                |
| PT with workspace                             | Existing behavior preserved                           |
| Unauthenticated                               | `RequireAuth` unchanged; local browser test passed    |
| Client                                        | Existing redirect decisions preserved and unit-tested |
| Backend checkout authority/provider selection | Unchanged                                             |

## Validation

Local Supabase responded successfully. `npm run supabase:status` was followed by the authorized `npm run supabase:db:reset`; no startup or Docker restart was needed. A local query confirmed schema head `20260922094541`, matching the repository. The reset replayed existing migrations only.

- All original 52 selected browser cases passed. Coverage was expanded by one client-to-PT-Billing boundary case and two bootstrap-recovery cases: **55 distinct cases passed, 0 remaining failures/skips**.
- Main selection: 46 passed (the original 45 plus the client boundary check).
- Paddle: 7 passed on the final complete run, including exact disabled/forbidden errors, safe/unsafe checkout URLs, provider selection and request contract.
- Additional bootstrap recovery: 2 passed.
- The no-workspace audit was also rerun with a JSON reporter to retain its sanitized before/after attachments: 4 passed.
- Initial exploratory audit failures were a strict locator matching two sign-in buttons; the test now uses the existing sign-in helper. The added client seed check uses the helper's actual truthy fixture return rather than expecting a boolean. No application change was needed.
- The first Paddle run had one five-second button-readiness timeout under concurrent load (6 passed, 1 failed). The failure snapshot showed the disabled button had subsequently rendered. The final full Paddle run passed all 7 without changing application code or timeouts.
- Full unit suite: 3,080 tests passed in 286 files, including 25 route-policy cases.
- Strict TypeScript (`tsc --noEmit`) and build: passed; Sentry upload disabled.
- Lint: passed with 0 errors and 3 existing warnings.
- Formatting, `git diff --check`, and added-content leakage scan: passed.

## Side-effect audit

Both the exact Billing route and trailing-slash/query variant rendered after normal login, with a matching PT identity and incomplete onboarding. Reload remained on Billing. The snapshots were equal before login/navigation and after Billing/reload.

| Fixture state            | Before | After | Delta |
| ------------------------ | ------ | ----- | ----- |
| Workspaces               | 0      | 0     | 0     |
| Account subscriptions    | 0      | 0     | 0     |
| Trials                   | 0      | 0     | 0     |
| Entitlement overrides    | 0      | 0     | 0     |
| Billing checkouts        | 0      | 0     | 0     |
| Paddle operations        | 0      | 0     | 0     |
| Plan-change operations   | 0      | 0     | 0     |
| Seat operations          | 0      | 0     | 0     |
| Notification preferences | 0      | 0     | 0     |
| PT Hub profiles          | 0      | 0     | 0     |
| PT Hub settings          | 0      | 0     | 0     |

Requested paid plan/full billing account rows, effective entitlements, account capacity, capacity reservations/events, root PT profile/onboarding completion, and auth metadata were unchanged. No incidental initialization writes were observed during Billing initialization; none were introduced by the exception. The existing workspace-onboarding mount writes described in the routing audit predate this change and remain outside this patch.

Navigating next to `/pt-hub/clients` still redirected to `/pt/onboarding/workspace`. Unauthenticated Billing still redirected to login. A client navigating to PT Billing returned to client home. Existing workspace-owner Billing flows passed through the Lemon Squeezy and Paddle suites.

Migrations added: 0. Remote migrations: 0. Local reset: existing repository migrations replayed. Real provider calls: 0 (provider interactions mocked/blocked). Staging/production mutations: 0. Commits/deployments: 0. No secret values or private identifiers were added to tracked content. This resume changed tests and this report only; application implementation was preserved.

## Files changed

- `src/lib/protected-route-guard.ts`
- `src/routes/app.tsx`
- `tests/unit/pre-workspace-pt-route.test.ts`
- `tests/unit/client-messages-route-wiring.test.ts`
- `tests/unit/client-preworkspace-shell-wiring.test.ts`
- `tests/unit/client-settings-route-wiring.test.ts`
- `tests/e2e/billing-pre-workspace.spec.ts`
- `tests/e2e/paddle-checkout.spec.ts`
- `docs/qa/BILL-ROUTE-01.md`

The three client source-contract tests were updated to read the extracted guard from its new location; their expectations were preserved. Validation is complete. Stop before commit; do not deploy.
