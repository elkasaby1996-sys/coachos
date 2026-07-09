# RepSync Beta Release Readiness Audit

Audit date: 2026-07-07

Scope: release readiness for a controlled RepSync beta, based on the current repository, local configuration files, migrations, tests, and operational docs. This audit does not include a production Supabase dashboard review, production hosting dashboard review, production email-provider dashboard review, or live beta-domain smoke test.

Severity:

- P0 blocker: must be resolved before inviting beta users.
- P1 launch risk: should be resolved before beta, or explicitly accepted with an owner and rollback.
- P2 beta backlog: acceptable for a small beta if tracked.
- P3 later: polish or scale hardening after beta.

No secrets are included in this document.

## 1. Executive Readiness Summary

RepSync looks close to a controlled beta from an application-surface standpoint. The repo contains focused coverage for auth, role routing, PT Hub, public profile and apply flow, client assignment workflows, check-ins, archived/transferred client states, notification center behavior, workspace-team permissions, and delete-protected assignment templates.

The beta recommendation is conditional no-go until the operational P0s are proven in a staging or production-like environment. The main risk is not a clearly visible product-code gap; it is lack of confirmed launch evidence for production environment variables, Supabase Auth redirect/provider settings, migration state, email delivery, monitoring, and launch-day smoke results.

After the P0s pass, the app is suitable for a small controlled beta with explicit owners for email delivery, monitoring, legal copy, and data cleanup.

## 2. Blockers

| ID         | Severity | Area            | Blocker                                                                                                                                                                          | Required resolution                                                                                                                                                                                              |
| ---------- | -------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BETA-P0-01 | P0       | Environment     | Production or staging runtime configuration has not been proven from this repo audit.                                                                                            | Verify the deployed host has the correct Supabase URL/key, public app URL assumptions, Sentry DSN/environment/release, and any provider/runtime secrets outside the client bundle.                               |
| BETA-P0-02 | P0       | Auth            | Supabase Auth production redirect allow-list and site URL are not verified. Local config only lists local callback URLs.                                                         | Confirm production and staging callback URLs, recovery URLs, invite URLs, and enabled social providers in Supabase before beta invites.                                                                          |
| BETA-P0-03 | P0       | Supabase        | Migration status against the beta database is not proven by this audit, and local migration status shows `20260707111500` exists locally but is not applied in the local ledger. | Apply or intentionally hold that migration locally, then run migration status against the intended beta project through the approved release process and confirm no pending, failed, or out-of-order migrations. |
| BETA-P0-04 | P0       | Email           | Transactional email delivery is documented and templates exist, but provider sending, sender identity, bounce handling, and auth email templates are not verified.               | Send and receive invite, confirmation, recovery, team invite, and product-notification emails in staging using the beta sender/domain.                                                                           |
| BETA-P0-05 | P0       | Launch evidence | Full launch-day smoke has not yet been recorded against the beta environment.                                                                                                    | Complete the launch-day smoke checklist in this document with seeded or real beta-test accounts.                                                                                                                 |

## 3. High-Priority Non-Blockers

| ID         | Severity | Area                 | Risk                                                                                                                     | Recommended action                                                                                                  |
| ---------- | -------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| BETA-P1-01 | P1       | Monitoring           | Sentry runtime support exists, but alert routing, release/source-map upload, and on-call ownership need launch proof.    | Configure Sentry env/release, source-map upload secrets, alert routing, and an owner.                               |
| BETA-P1-02 | P1       | Auth providers       | Docs say Google is wired while Apple/Facebook are staged. UI/provider availability must match production configuration.  | Keep only configured providers visible for beta, or complete provider setup.                                        |
| BETA-P1-03 | P1       | Data cleanup         | Test clients, fake public profiles, old invites, duplicate members, and stale assignments can confuse beta coaches.      | Run a beta data cleanup query pack and archive any non-beta rows before launch.                                     |
| BETA-P1-04 | P1       | Legal/product safety | Privacy, terms, and support routes exist, but a beta-specific coaching/fitness disclaimer is not proven from this audit. | Add or verify lightweight beta disclaimers for health, coaching limitations, emergency guidance, and data handling. |
| BETA-P1-05 | P1       | Reliability          | Auth and workflow smoke tests exist, but staging smoke execution is not yet recorded here.                               | Run auth, PT, client, public profile, apply, assignment, and check-in smoke against staging.                        |

## 4. Environment/Config Checklist

| Item                              | Status                  | Notes                                                                                         |
| --------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| Supabase client URL/key           | Needs beta verification | Example and local key names exist. Production values must be verified in hosting secrets/env. |
| Supabase Auth site URL            | Needs beta verification | Local config points to local development. Production dashboard must use the beta app host.    |
| Supabase Auth redirect allow-list | P0 needs verification   | Docs require local, staging, and production hosts through `/auth/callback`.                   |
| Sentry DSN/environment/release    | Needs beta verification | Client initialization exists and is disabled when DSN is absent.                              |
| Sentry source-map upload          | Needs beta verification | Vite config supports upload when Sentry build secrets are present.                            |
| Marketing/public host URL         | Needs beta verification | Public profile/apply flows need final beta host assumptions verified.                         |
| Exercise dataset config           | P2                      | Config keys exist. If not used in beta, document disabled or fallback behavior.               |
| Wearables edge-function config    | P2                      | Open wearables runtime env is separate. Disable or exclude from beta if not supported.        |
| Local env hygiene                 | Pass in doc scope       | This audit records key names only and does not commit secrets.                                |

## 5. Supabase/Migration/RLS Checklist

| Item                        | Status                                   | Notes                                                                                                                                                                                      |
| --------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Active migrations inventory | Present                                  | Active SQL migrations are under `supabase/migrations`; legacy migrations are separated.                                                                                                    |
| Latest migration present    | Present                                  | Latest observed active migration: `20260707111500_pt_hub_clients_page_all_relationship_scope.sql`.                                                                                         |
| Seed behavior               | Pass                                     | Local `supabase/config.toml` has seed disabled.                                                                                                                                            |
| RLS coverage                | Needs release verification               | Many migrations enable RLS/policies for clients, workspace teams, notifications, assignments, storage, and public profiles. Run DB lint and staging policy smoke before launch.            |
| Storage policies            | Present, verify in staging               | Buckets/policies exist for baseline photos, check-in photos, PT profile media, and medical documents.                                                                                      |
| Security definer hygiene    | Local DB lint pass                       | Migrations commonly set explicit search paths. Local DB lint returned no error-level findings.                                                                                             |
| Destructive migration risk  | No obvious recent blocker from file scan | Recent migration names and content focus on continuity, transfer safety, assignment behavior, and PT Hub relationship scope. Still confirm with migration status before applying remotely. |
| Remote migration deployment | P0 controlled process                    | Use the guarded release path only. Do not push migrations directly outside the approved named project flow.                                                                                |
| Local migration status      | P0 needs resolution                      | `npx supabase@latest migration list --local` completed, but `20260707111500` was present locally with no matching applied ledger entry.                                                    |

## 6. Auth/Roles Checklist

| Item                         | Status                                     | Notes                                                                                                      |
| ---------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Email/password auth          | Covered by code/tests, needs staging smoke | Auth callbacks, guards, and Supabase auth config contracts have unit/e2e coverage.                         |
| Signup confirmation          | Needs beta verification                    | Local Supabase config has confirmations enabled. Production templates and callback links must be verified. |
| Password recovery            | Needs beta verification                    | Docs require recovery links through `/auth/callback?type=recovery&next=/auth/reset-password`.              |
| PT role routing              | Covered by tests, smoke required           | PT route guards and onboarding paths have coverage.                                                        |
| Client role routing          | Covered by tests, smoke required           | Client onboarding/home reroute and protected routes have coverage.                                         |
| Workspace member roles       | Covered by tests, smoke required           | Owner/coach/assistant/viewer and client-access rules are heavily tested.                                   |
| Archived/transferred clients | Covered by tests, smoke required           | Relationship continuity, archived reinvite, transfer, and read-only states have regression coverage.       |

## 7. Email/Notification Checklist

| Item                     | Status           | Notes                                                                                                      |
| ------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| In-app notifications     | Present          | Notification center APIs and UI tests exist.                                                               |
| Mark all as read         | Recently touched | There is a migration for notification read timestamps and UI tests. Re-smoke after current branch changes. |
| Product email templates  | Present          | Email rendering, template variables, and delivery patch helpers exist.                                     |
| Email provider send path | P0 needs proof   | No provider dashboard proof is available in this audit.                                                    |
| Sender identity          | P0 needs proof   | Verify staging and production sender/domain before beta.                                                   |
| Bounce/webhook handling  | P1               | Docs define desired behavior. Confirm provider webhooks or accepted fallback logging.                      |
| Notification preferences | Present          | Preference records include in-app/email/push channels and type-specific flags.                             |
| Auth emails              | P0 needs proof   | Supabase templates must point to beta callback URLs and use beta-safe transactional copy.                  |

## 8. Monitoring Checklist

| Item                    | Status                  | Notes                                                                             |
| ----------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| Frontend error tracking | Needs beta verification | `src/lib/sentry.ts` initializes when DSN exists.                                  |
| Error boundary capture  | Present                 | App error boundary captures render errors to Sentry.                              |
| Source maps             | Needs beta verification | Build-time plugin support exists behind Sentry env vars.                          |
| Alert routing           | P1                      | `docs/ops-monitoring-checklist.md` leaves alert routing unchecked.                |
| Uptime checks           | P1                      | `/health`, `/login`, `/pt/dashboard`, and `/app/home` checks should be monitored. |
| Supabase/API logs       | P1                      | Confirm beta project log access and owner.                                        |
| Incident owner          | P1                      | Define on-call, rollback owner, and communication channel.                        |

## 9. Critical Workflow Checklist

| Workflow                             | Status                  | Launch smoke requirement                                                            |
| ------------------------------------ | ----------------------- | ----------------------------------------------------------------------------------- |
| PT signup/login/onboarding           | Covered, smoke required | Create/sign in PT and reach PT Hub/dashboard.                                       |
| Client invite/accept/onboarding      | Covered, smoke required | Generate invite, accept as client, complete onboarding, confirm workspace relation. |
| Public PT profile                    | Covered, smoke required | Publish profile, view public URL, copy link, apply from public page.                |
| Apply flow and lead conversion       | Covered, smoke required | Submit application, view lead, convert to client, verify no duplicate client row.   |
| Workout template assignment          | Covered, smoke required | Assign workout, same-day override, completed replacement blocked.                   |
| Program assignment                   | Covered, smoke required | Assign program, verify materialized schedule and delete protection.                 |
| Nutrition assignment                 | Covered, smoke required | Assign and remove nutrition plan, verify confirmation dialog.                       |
| Check-ins                            | Covered, smoke required | Verify not-open, open, submitted, reviewed, and cadence states.                     |
| Messages                             | Covered, smoke required | Send PT-to-client and client-to-PT messages; verify unread counts.                  |
| Workspace team invites               | Covered, smoke required | Invite team member, accept, verify role/client-access restrictions.                 |
| Archived/removed/transferred clients | Covered, smoke required | Open details and verify historical/read-only behavior.                              |
| Payments/billing                     | P2 for beta if disabled | If billing is not connected, verify copy and no broken payment path.                |

## 10. Data Cleanup Checklist

Before beta launch, run and review cleanup against the beta database:

- Remove or archive fake PT profiles that should not be public.
- Remove test public package data unless intentionally seeded for beta.
- Remove stale workspace invites and expired client invites.
- Confirm duplicate workspace members are deduped.
- Confirm archived, removed, and transferred clients are intentionally visible where expected.
- Confirm clients table counts and PT Hub KPIs match the launch data definition.
- Confirm no test credentials, fake emails, or local-only URLs are visible in public profile/apply surfaces.
- Confirm storage buckets do not contain orphaned sensitive test uploads.
- Confirm notification deliveries do not include test-only action URLs.
- Export a pre-launch backup or snapshot using the approved Supabase backup process.

## 11. Legal/Product Safety Checklist

| Item                               | Status                 | Notes                                                                                                                      |
| ---------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Privacy page                       | Present                | Route exists and footer strings reference it.                                                                              |
| Terms page                         | Present                | Route exists and footer strings reference it.                                                                              |
| Support path                       | Present                | Support route/mailto patterns exist.                                                                                       |
| Account deletion/deactivation path | Present, improve later | Client settings directs users to support for deletion/deactivation.                                                        |
| Coaching/fitness disclaimer        | P1 needs proof         | Verify terms/app copy clearly says RepSync does not provide medical advice and emergency issues require professional care. |
| Beta label/expectations            | P1                     | Beta users should know the product is in beta, how support works, and what data may be reset or corrected.                 |
| Data retention                     | P1                     | Publish or document retention expectations for workouts, nutrition, check-ins, photos, messages, and medical uploads.      |
| Consent for sensitive uploads      | P1                     | Medical/photo upload flows should make data sensitivity clear.                                                             |

## 12. Performance/Reliability Checklist

| Item                      | Status | Notes                                                                                                   |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| Production build          | Pass   | `npm run build` passed on this branch.                                                                  |
| Unit test suite           | Pass   | `npm run test:unit` passed: 190 test files, 961 tests.                                                  |
| Lint                      | Pass   | `npm run lint` passed.                                                                                  |
| DB lint                   | Pass   | `npm run supabase:db:lint` passed with no error-level findings.                                         |
| Mobile smoke              | P1     | Manually check 375 px for PT Hub, client detail, public profile, apply, check-ins, messages, templates. |
| Slow route telemetry      | P2     | Use Sentry/browser performance after launch.                                                            |
| Realtime reliability      | P1     | Smoke notification, message, and assignment refresh behavior in staging.                                |
| Backup/restore confidence | P1     | Confirm the beta database can be restored or rolled forward.                                            |

## 13. Launch-Day Smoke Test Checklist

Run this against the beta environment after deployment and before inviting beta users:

- Open `/health` and confirm it returns healthy output.
- Sign up or sign in as a PT.
- Confirm Supabase auth email confirmation or invite callback lands on the correct app route.
- Publish a PT public profile and open the public profile URL in a signed-out browser.
- Submit a public application and verify it appears in PT Hub leads.
- Convert a lead to a client and confirm the client appears in PT Hub clients and workspace clients.
- Invite a client, accept the invite, complete onboarding, and verify the client home route.
- Assign a workout, program, nutrition plan, and check-in.
- Submit and review a check-in.
- Send a message in both directions and verify notifications/unread states.
- Mark notifications read and verify the unread count clears.
- Create, invite, and accept a workspace team member; verify role and client-access rules.
- Open archived/removed/transferred client details and confirm read-only historical behavior.
- Verify template delete protection for assigned workout and program templates.
- Open public apply form on mobile width and submit a test lead.
- Confirm Sentry receives a release/session event in the beta environment.
- Confirm no local URLs, test-only copy, or secrets appear in page source or visible UI.

Verification already run during this audit:

- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run test:unit`: passed, 190 files and 961 tests.
- `npm run supabase:db:lint`: passed, no error-level findings.
- `npx supabase@latest migration list --local`: completed, but `20260707111500` is not applied in the local migration ledger.
- `npm run test:e2e:smoke -- tests/e2e/auth-guards.smoke.spec.ts tests/e2e/auth-onboarding.smoke.spec.ts tests/e2e/auth-resilience.spec.ts`: passed 7 tests, skipped 2 non-auth workflow smoke specs by their own suite conditions.

## 14. Rollback Plan

1. Stop new beta invites and public sharing immediately.
2. If the issue is frontend-only, roll back the hosting deployment to the last known good build.
3. If the issue is auth/email configuration, disable the affected provider or template in Supabase and communicate a manual support path.
4. If the issue is a migration or data integrity problem, do not run destructive commands. Pause writes if necessary, capture logs, and use the approved Supabase backup/restore or forward-fix process.
5. If public profile/apply is affected, unpublish affected profiles or route users to support while preserving existing lead/client rows.
6. Notify beta users with the scope, expected recovery time, and whether any action is needed.
7. Record the incident, owner, timeline, and follow-up PRs before re-opening invites.

## 15. Recommended PR Split For Remaining Fixes

1. PR-BETA-OPS-01: production/staging environment proof, Supabase Auth redirect proof, migration status evidence, launch smoke checklist results.
2. PR-BETA-EMAIL-01: transactional email provider verification, sender/domain setup, webhook or fallback delivery logging, auth email template proof.
3. PR-BETA-SMOKE-01: add or update automated smoke scripts and seeded beta data for launch-day flows.
4. PR-BETA-LEGAL-01: beta disclaimer, coaching/fitness safety copy, support/delete/data-retention clarification.
5. PR-BETA-MONITORING-01: Sentry release/source maps, alert routing, uptime checks, incident owner runbook.
6. PR-BETA-DATA-01: beta cleanup SQL/runbook for test profiles, stale invites, duplicate team members, orphaned uploads, and notification rows.

The recommended next PR is PR-BETA-OPS-01 because it turns the current unknowns into launch evidence without changing product behavior.

## 16. Beta Go/No-Go Recommendation

No-go for real beta users today until the P0 items are cleared with recorded evidence.

Go for internal staging dry-run now.

Go for a small controlled beta after:

- Production/staging env and Supabase Auth settings are verified.
- Migration status and DB lint are clean for the intended beta project.
- Auth and transactional email flows are proven end to end.
- Launch-day smoke passes on desktop and 375 px mobile.
- Monitoring, rollback owner, and support path are live.

After those are complete, remaining P1 items can be accepted only if each has an owner, a mitigation, and a rollback note.
