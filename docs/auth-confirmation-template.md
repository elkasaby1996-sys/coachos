# RepSync Confirm signup email contract

Deploy `/confirm-signup` before changing the hosted Supabase **Confirm signup**
template. This repository change does not update hosted settings.

The confirmation button URL must be:

```text
{{ .SiteURL }}/confirm-signup#token_hash={{ .TokenHash }}
```

- **DO NOT link directly to `{{ .ConfirmationURL }}` for RepSync signup confirmation.**
- The token hash belongs in the fragment, never the query string. Fragments are not
  sent in HTTP requests to the hosting server.
- `/confirm-signup` does not verify on page load. It captures the credential only
  in memory and immediately replaces the visible URL with `/confirm-signup`, before
  app telemetry starts. Refreshing after capture requires reopening the email link.
- Only an explicit **Confirm email** button press triggers
  `supabase.auth.verifyOtp({ token_hash, type: "email" })`.
- Email/link tracking should remain disabled for authentication emails where applicable.
- Site URL and redirect allowlist remain environment-specific hosted settings.
- Verified `user_metadata.account_type` supplies onboarding intent only. The
  existing `/auth/callback` remains responsible for provisioning and final routing;
  no credential or caller-supplied destination is forwarded to it.

Minimal template for review and later hosted rollout:

```html
<h2>Confirm your RepSync account</h2>
<p>Confirm your email address to finish creating your RepSync account.</p>
<p>
  <a href="{{ .SiteURL }}/confirm-signup#token_hash={{ .TokenHash }}">
    Confirm email
  </a>
</p>
<p>If you didn't create a RepSync account, you can ignore this email.</p>
```

See Supabase's [email template guidance](https://supabase.com/docs/guides/auth/auth-email-templates)
and [verifyOtp reference](https://supabase.com/docs/reference/javascript/auth-verifyotp).
This protects against GET-only email scanners; automation that actively presses
the confirmation button can still consume a single-use credential.
