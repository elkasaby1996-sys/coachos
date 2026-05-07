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

## Auth Email Templates

Supabase Auth templates should be branded as RepSync transactional emails:

- Confirm signup: point the action link to `/auth/callback?type=signup`.
- Reset password: point the action link to `/auth/callback?type=recovery&next=/auth/reset-password`.
- Email change confirmation: point the action link to `/auth/callback?type=email_change`.
- Invite or activation: point links to `/auth/callback?type=invite` or `/invite/<token>` depending on the invitation flow.

Auth and security emails bypass product notification preferences. Keep copy direct and non-marketing. Include a plain-text fallback where the provider supports it.

## Product Email and Push

Product notifications use `notification_preferences`, `notification_events`, and `notification_deliveries`. Product email and push delivery must call `shouldDeliverNotification` before sending unless the event is transactional.

Client-facing action URLs must start with `/app` or `/client/onboarding`. PT-facing action URLs must start with `/pt`, `/pt-hub`, or `/workspace`.

Web push currently stores browser subscriptions in `push_subscriptions`. Production VAPID keys or any future provider credentials must be configured outside the client bundle.
