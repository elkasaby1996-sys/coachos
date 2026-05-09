# Auth, Email, and Notification Configuration

RepSync uses Supabase Auth for identity only. App access is resolved from app profile and membership rows after auth completes.

## Redirect URLs

Configure Supabase Auth redirect allow-list entries for each environment:

- Local: `http://localhost:5173/**`, `http://127.0.0.1:5173/**`
- Staging: `https://<staging-host>/**`
- Production: `https://<production-host>/**`

All auth links should route through `/auth/callback`. Password recovery uses `/auth/callback?type=recovery&next=/auth/reset-password`.

Local Supabase must keep email confirmations enabled:

```toml
[auth.email]
enable_signup = true
enable_confirmations = true
```

When confirmations are enabled locally, verification mail is delivered to Mailpit/Inbucket rather than returned as an immediate session.

## Social Providers

Google is the only provider currently wired in the UI. Enable it in Supabase Auth with the project callback URL supplied by Supabase. Apple and Facebook are intentionally staged until provider credentials and redirect URLs are configured.

Do not commit provider secrets. Keep OAuth client IDs/secrets in Supabase provider configuration or deployment secrets.

## Provider-managed auth emails

Supabase Auth owns the provider-managed identity templates below. They are transactional and bypass product notification preferences:

- `auth.confirm_signup`: point the action link to `/auth/callback?type=signup`.
- `auth.reset_password`: point the action link to `/auth/callback?type=recovery&next=/auth/reset-password`.
- `auth.email_change_confirmation`: point the action link to `/auth/callback?type=email_change`.
- `auth.security_alert`: use direct security copy and never include raw tokens.
- `client.invite_activation`: point links to `/auth/callback?type=invite` or `/invite/<token>` depending on the invitation flow.
- `client.assignment_claim`: point links to `/client/onboarding` or the invite claim flow when assignment requires account activation.

Auth and security email copy should be branded as RepSync transactional email: direct, non-marketing, and with a plain-text fallback where the provider supports it. Supabase Auth templates are configured in Supabase, not in app screens.

## App-managed product email templates

Product notifications use `notification_preferences`, `notification_events`, and `notification_deliveries`. Email is a channel (`channel = email`) alongside `in_app` and `push`.

Stable product template keys include:

- PT: `pt.new_lead`, `pt.join_request_submitted`, `pt.client_escalation`, `pt.missed_checkin_summary`, `pt.client_onboarding`, `pt.weekly_digest`, `pt.product_update`.
- Client: `client.workout_assigned`, `client.program_assigned`, `client.habit_assigned`, `client.habit_due`, `client.checkin_due`, `client.checkin_feedback`, `client.message_received`, `client.file_shared`, `client.appointment_reminder`.

Product, reminder, and digest emails respect the email preference channel and type-specific preferences. Security and transactional emails bypass product notification preferences. Suppressed product emails should be logged as `suppressed_preference`, not `failed`; users without an email address should be logged as `suppressed_no_channel`.

Client-facing action URLs must start with `/app` or `/client/onboarding`. PT-facing action URLs must start with `/pt`, `/pt-hub`, or `/workspace`.

Template variables must be validated before provider send. User-provided text must be escaped before HTML render, and messages should not embed sensitive IDs or secrets unless a secure token is required for activation.

## Sender identity

Use a verified RepSync sender identity for production email, for example `RepSync <notifications@repsync.app>` or the deployment-specific verified domain. Local development may use Mailpit/Inbucket or the `dev-log` provider mode. Staging should use the staging verified sender/domain. Production should use the production verified sender/domain.

Do not commit provider secrets. Keep API keys, webhook secrets, SMTP passwords, OAuth provider secrets, VAPID private keys, and sender-domain credentials in Supabase provider configuration or deployment secrets.

## Webhook and bounce handling

Provider webhooks should update `notification_deliveries.provider_message_id`, `sent_at`, `delivered_at`, `status`, `failure_code`, and `failure_reason` when the provider supports those events. Delivered webhooks should mark `delivered`; bounce webhooks should mark `bounced`; retryable provider failures should use `retrying` with `next_retry_at`.

Webhook verification secrets must stay server-only. If a provider webhook is not configured in an environment, delivery status should still be logged through the provider send result so operators can inspect queued, sent, failed, and suppressed rows.

## Product Email and Push

Web push currently stores browser subscriptions in `push_subscriptions`. Production VAPID keys or any future provider credentials must be configured outside the client bundle.
