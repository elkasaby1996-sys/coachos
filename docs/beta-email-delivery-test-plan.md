# RepSync Beta Email Delivery Test Plan

Prepared: 2026-07-09

Scope: operations evidence-prep for beta email delivery. This plan does not change email templates, auth logic, product code, database schema, RLS, routing, notification behavior, or provider configuration.

Secret-handling rule: do not commit private recipient emails, API keys, sender secrets, dashboard credentials, provider message payloads, raw tokens, full invite URLs, or full email contents. Record only safe status fields, redacted screenshot/log references, and placeholder-safe test identities.

Beta precondition: run this plan only after the beta public host, Supabase Auth URL/redirect allow-list, sender identity, provider env, and safe test accounts are ready.

## 1. Safe Test Account Matrix

Use placeholders only unless explicit safe real test inboxes are provided by the release owner. If real inboxes are used, keep them in private test run notes and do not commit them.

| Placeholder account                | Role                          | Used for                                                                                      | Setup expectation                                                               | Commit real email? |
| ---------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------ |
| `beta_pt_owner@example.test`       | PT owner / workspace owner    | Signup, recovery, client invite, lead notification, check-in review, message tests            | Owns the beta test workspace and has permission to invite clients/team members. | No                 |
| `beta_client_invite@example.test`  | Invited client                | Client invite, client signup confirmation, check-in review notification, message notification | Can receive client invite and complete client onboarding when needed.           | No                 |
| `beta_team_member@example.test`    | Invited workspace team member | Workspace/team invite                                                                         | Can receive `/team-invites/:token` invite and accept with invited email.        | No                 |
| `beta_lead_applicant@example.test` | Public lead applicant         | Public application / lead notification                                                        | Used on public PT profile apply form as the applicant identity.                 | No                 |

## 2. Provider Readiness Checklist

Complete this checklist before sending test emails.

| Item                                             | Required status before test        | Evidence to record without secrets                                               | Owner             |
| ------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------- | ----------------- |
| Resend domain verified                           | Verified or intentionally disabled | `verified`, `missing`, `unknown`, or `intentionally disabled`                    | Email owner TBD   |
| Sender identity verified                         | Verified                           | Sender display/domain status only, no credentials                                | Email owner TBD   |
| Bounce handling or fallback logging defined      | Verified or intentionally deferred | Delivery status path: provider webhook, delivery row, or provider dashboard      | Email owner TBD   |
| Supabase Auth templates use beta host            | Verified                           | Confirmation/recovery/invite templates checked; no localhost                     | Auth owner TBD    |
| Product email templates use beta host            | Verified                           | Product action URL host checked; no localhost                                    | Email owner TBD   |
| Product email channel enabled only when intended | Verified or intentionally disabled | Email channel status and affected notification types                             | Email owner TBD   |
| Unsubscribe/preferences behavior documented      | Verified where relevant            | Product emails respect preferences; transactional auth emails bypass preferences | Email owner TBD   |
| Support address present                          | Verified                           | Support sender/reply-to status only                                              | Support owner TBD |

## 3. Callback and Route Expectations

All expected hosts below must use the beta public app host, never localhost.

| Link type                            | Expected beta route/callback                                                                                  | Expected post-click route                                                           | Notes                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------- |
| Signup confirmation                  | `/auth/callback?type=signup` or `/auth/callback` with signup context                                          | Auth callback resolves to the account path or login/onboarding flow                 | Supabase Auth template-managed.          |
| Password recovery                    | `/auth/callback?type=recovery&next=/auth/reset-password`                                                      | `/auth/reset-password`                                                              | Supabase Auth template-managed.          |
| Client invite / magic link           | `/auth/callback?type=invite&invite=<token>` or `/invite/:token`                                               | `/invite/:token`, then `/app/home` or `/client/onboarding/account` after acceptance | Do not record raw token.                 |
| Workspace/team invite                | `/team-invites/:token`                                                                                        | `/team-invites/:token`, then `/pt-hub` after acceptance                             | Do not record raw token.                 |
| Public application lead notification | `/pt-hub/leads/:id` or `/pt-hub/leads`                                                                        | PT lead detail/list page                                                            | Use redacted lead id in evidence.        |
| Check-in review notification         | `/app/checkins?checkin=<id>` if action URL is present                                                         | Client check-ins page with reviewed check-in context                                | Only if product email channel is active. |
| Message notification                 | `/app/messages` for client recipients; `/pt/messages` or `/pt-hub`/allowed PT message route for PT recipients | Relevant message inbox/thread or audience fallback                                  | Only if product email channel is active. |

## 4. Evidence Record Template

Create one row per email sent. Do not commit screenshots that expose private inboxes, full message bodies, full recipient addresses, raw tokens, provider IDs, or private dashboard data.

| Flow     | Triggered by | Sent timestamp    | Recipient placeholder | Received? | No localhost URL? | Expected host? | Route after click | Token/callback valid?   | Screenshot/log reference | Owner     | Date     | Result      |
| -------- | ------------ | ----------------- | --------------------- | --------- | ----------------- | -------------- | ----------------- | ----------------------- | ------------------------ | --------- | -------- | ----------- |
| `<flow>` | `<action>`   | `<UTC timestamp>` | `<placeholder>`       | `yes/no`  | `yes/no`          | `yes/no`       | `<route only>`    | `yes/no/not applicable` | `<redacted reference>`   | `<owner>` | `<date>` | `pass/fail` |

Pass criteria for every applicable row:

- Email is received by the intended safe test inbox.
- All visible links use the beta host.
- No visible URL points to `localhost`, `127.0.0.1`, `host.docker.internal`, or an unintended environment.
- Link lands on the expected route.
- Token/callback is valid and does not show a broken or expired-token error unless expiry is the specific test case.
- Provider/dashboard delivery status is `sent`, `delivered`, or equivalent. If provider delivery telemetry is unavailable, record the alternate evidence source.

Fail criteria:

- Email is not received within the agreed delivery window.
- Any link points to a local or wrong environment host.
- Callback/token is invalid for a fresh test.
- The wrong recipient receives the email.
- The route opens a forbidden, blank, or wrong-audience page.

Fallback evidence when email fails:

- Record provider delivery status if available.
- Record app in-app notification/fallback route if applicable.
- Record whether a copyable fallback invite link was shown to the operator.
- Keep the P0 email proof open until delivery and link behavior pass.

## 5. Flow Test Plan

### 5.1 Supabase Signup Confirmation

| Field                     | Plan                                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger action            | Create a new account with the safe test identity, using the beta app signup surface. Prefer the role needed for the test run, usually PT owner or invited client. |
| Sender expectation        | Supabase Auth transactional sender configured for beta.                                                                                                           |
| Recipient role            | `beta_pt_owner@example.test` or `beta_client_invite@example.test`.                                                                                                |
| Expected subject pattern  | Contains confirmation language such as `Confirm`, `Verify`, or `RepSync`.                                                                                         |
| Expected link host        | Beta public app host.                                                                                                                                             |
| Expected callback route   | `/auth/callback?type=signup` or `/auth/callback` with signup context.                                                                                             |
| Expected post-click route | Account path, login, PT onboarding, client onboarding, or app home according to the signup state.                                                                 |
| Evidence to record        | Sent timestamp, received yes/no, no localhost yes/no, clicked route, token valid yes/no, redacted screenshot/log reference.                                       |
| Pass/fail criteria        | Pass if the confirmation email arrives, uses beta host, callback succeeds, and no localhost URL is visible.                                                       |
| Fallback if email fails   | Check Supabase Auth logs/provider logs privately; record not received; keep email P0 open.                                                                        |

### 5.2 Supabase Password Recovery

| Field                     | Plan                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Trigger action            | From beta `/auth/forgot-password`, request recovery for a safe existing account.                                          |
| Sender expectation        | Supabase Auth transactional sender configured for beta.                                                                   |
| Recipient role            | `beta_pt_owner@example.test` or `beta_client_invite@example.test`.                                                        |
| Expected subject pattern  | Contains password reset/recovery language such as `Reset`, `Recover`, or `Password`.                                      |
| Expected link host        | Beta public app host.                                                                                                     |
| Expected callback route   | `/auth/callback?type=recovery&next=/auth/reset-password`.                                                                 |
| Expected post-click route | `/auth/reset-password`.                                                                                                   |
| Evidence to record        | Sent timestamp, received yes/no, no localhost yes/no, final route, token valid yes/no.                                    |
| Pass/fail criteria        | Pass if the recovery email arrives, opens beta host, lands on reset-password, and accepts a valid fresh recovery session. |
| Fallback if email fails   | Check Supabase Auth logs/provider logs privately; do not reset password through a private workaround as proof.            |

### 5.3 Client Invite Email

| Field                     | Plan                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger action            | Sign in as `beta_pt_owner@example.test`, invite `beta_client_invite@example.test` from the beta client invite flow.                          |
| Sender expectation        | Product or auth invite sender configured for beta.                                                                                           |
| Recipient role            | `beta_client_invite@example.test`.                                                                                                           |
| Expected subject pattern  | Contains invite language such as `Invite`, `invited`, or `RepSync`.                                                                          |
| Expected link host        | Beta public app host.                                                                                                                        |
| Expected callback route   | `/invite/:token` or `/auth/callback?type=invite&invite=<token>`.                                                                             |
| Expected post-click route | `/invite/:token`, then `/client/onboarding/account` if profile setup is incomplete, or `/app/home` after accepted invite.                    |
| Evidence to record        | Invite sent timestamp, received yes/no, route after click, acceptance result, no localhost yes/no, fallback copy-link availability if shown. |
| Pass/fail criteria        | Pass if the invite email arrives, link uses beta host, token is valid, and client can reach the expected invite/onboarding/home route.       |
| Fallback if email fails   | Record whether an in-app/operator copyable invite link exists; do not count fallback link as email delivery proof.                           |

### 5.4 Workspace/Team Invite Email

| Field                     | Plan                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Trigger action            | Sign in as `beta_pt_owner@example.test`, invite `beta_team_member@example.test` from Workspace Settings team invite flow.       |
| Sender expectation        | Product team-invite sender configured for beta.                                                                                 |
| Recipient role            | `beta_team_member@example.test`.                                                                                                |
| Expected subject pattern  | Contains workspace/team invite language such as `Workspace invite`, `Team invite`, or `invited`.                                |
| Expected link host        | Beta public app host.                                                                                                           |
| Expected callback route   | `/team-invites/:token`.                                                                                                         |
| Expected post-click route | `/team-invites/:token`, then `/pt-hub` after accepted invite.                                                                   |
| Evidence to record        | Sent timestamp, received yes/no, no localhost yes/no, route after click, token valid yes/no, acceptance result.                 |
| Pass/fail criteria        | Pass if the email arrives, beta link opens the secure invite page, invited account can accept, and workspace appears in PT Hub. |
| Fallback if email fails   | Record operator fallback/copy link if shown; keep delivery proof failed until email arrives.                                    |

### 5.5 Public Application / Lead Notification Email

| Field                     | Plan                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger action            | As signed-out or safe applicant, submit public application/lead form using `beta_lead_applicant@example.test` for the beta PT public profile. |
| Sender expectation        | Product notification sender configured for beta if lead email notifications are active.                                                       |
| Recipient role            | `beta_pt_owner@example.test`.                                                                                                                 |
| Expected subject pattern  | Contains lead/application language such as `New lead`, `Application`, `Join request`, or `RepSync`.                                           |
| Expected link host        | Beta public app host.                                                                                                                         |
| Expected callback route   | Product notification action URL, expected `/pt-hub/leads/:id` or `/pt-hub/leads`.                                                             |
| Expected post-click route | PT lead detail or PT Hub leads list.                                                                                                          |
| Evidence to record        | Application submitted timestamp, email received yes/no, lead visible in PT Hub yes/no, route after click, no localhost yes/no.                |
| Pass/fail criteria        | Pass if the PT owner receives the lead notification and the link opens the corresponding beta lead route.                                     |
| Fallback if email fails   | Verify in-app notification center and lead list privately; email proof remains not cleared.                                                   |

### 5.6 Check-in Review Notification Email, If Email Channel Active

| Field                     | Plan                                                                                                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger action            | Client submits a check-in; PT reviews it and adds feedback in beta.                                                                                                                    |
| Sender expectation        | Product notification sender configured for beta, only if email channel is active for check-in feedback.                                                                                |
| Recipient role            | `beta_client_invite@example.test`.                                                                                                                                                     |
| Expected subject pattern  | Contains check-in/review/feedback language such as `Check-in`, `Review`, or `Feedback`.                                                                                                |
| Expected link host        | Beta public app host.                                                                                                                                                                  |
| Expected callback route   | Product notification action URL, expected `/app/checkins?checkin=<id>` if action URL is present.                                                                                       |
| Expected post-click route | Client check-ins page with the reviewed check-in context, or safe client fallback route if no direct action URL exists.                                                                |
| Evidence to record        | Review timestamp, email received yes/no, no localhost yes/no, route after click, in-app notification fallback.                                                                         |
| Pass/fail criteria        | Pass if the email arrives when the channel is active, opens beta host, and lands on the expected client check-in route or documented fallback.                                         |
| Fallback if email fails   | Record in-app notification center behavior; keep email proof open. If email channel is intentionally disabled, record `intentionally disabled` with owner approval instead of running. |

### 5.7 Message Notification Email, If Email Channel Active

| Field                     | Plan                                                                                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger action            | Send a PT-to-client message and, if PT email notifications are active, a client-to-PT message.                                                                                      |
| Sender expectation        | Product notification sender configured for beta, only if message email channel is active.                                                                                           |
| Recipient role            | `beta_client_invite@example.test` for PT-to-client; `beta_pt_owner@example.test` for client-to-PT.                                                                                  |
| Expected subject pattern  | Contains message language such as `Message`, `New message`, or `RepSync`.                                                                                                           |
| Expected link host        | Beta public app host.                                                                                                                                                               |
| Expected callback route   | Client: `/app/messages`; PT: `/pt/messages`, `/pt-hub`, or documented allowed PT message route.                                                                                     |
| Expected post-click route | Relevant message inbox/thread, or documented audience fallback route.                                                                                                               |
| Evidence to record        | Sent timestamp, received yes/no, no localhost yes/no, clicked route, message visible yes/no.                                                                                        |
| Pass/fail criteria        | Pass if the email arrives when the channel is active, the link uses beta host, and the recipient reaches a valid message route.                                                     |
| Fallback if email fails   | Record in-app notification/FAB behavior; keep email proof open. If email channel is intentionally disabled, record `intentionally disabled` with owner approval instead of running. |

## 6. Run Order

1. Verify provider readiness checklist.
2. Verify Supabase Auth Site URL and redirect allow-list for beta host.
3. Create or confirm safe test accounts privately.
4. Run Supabase Auth signup confirmation.
5. Run Supabase Auth password recovery.
6. Run client invite email.
7. Run workspace/team invite email.
8. Run public application / lead notification.
9. Run check-in review notification only if product email channel is active.
10. Run message notification only if product email channel is active.
11. Update `docs/beta-ops-launch-evidence.md` with delivery proof statuses only after live evidence is collected.

## 7. Final Evidence Summary Template

Use this summary in release notes or private evidence after the run. Keep committed docs value-only and status-only.

| Area                        | Status                                               | Evidence reference     | Owner                | Date     | Notes                              |
| --------------------------- | ---------------------------------------------------- | ---------------------- | -------------------- | -------- | ---------------------------------- |
| Supabase Auth emails        | `verified/missing/not tested`                        | `<redacted reference>` | Auth/email owner TBD | `<date>` | Confirmation and recovery.         |
| Invite emails               | `verified/missing/not tested`                        | `<redacted reference>` | Email owner TBD      | `<date>` | Client and team invite.            |
| Product notification emails | `verified/missing/intentionally disabled/not tested` | `<redacted reference>` | Email owner TBD      | `<date>` | Lead, check-in feedback, messages. |
| No localhost URLs           | `yes/no/not tested`                                  | `<redacted reference>` | QA owner TBD         | `<date>` | All tested emails.                 |
| Callback/token validity     | `yes/no/not tested`                                  | `<redacted reference>` | QA owner TBD         | `<date>` | All applicable links.              |
