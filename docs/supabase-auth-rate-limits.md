# Supabase Auth Rate-Limit Checklist

These limits are configured in the Supabase dashboard rather than in repo code.

Recommended starting points:

- Email/password sign-in:
  Keep the default provider limits enabled and set a stricter per-IP threshold if your traffic is low to moderate.
- Email/password sign-up:
  Enable email confirmation and keep sign-up attempts per IP conservative.
- OTP email:
  Set a resend cooldown of at least 60 seconds.
- OTP SMS:
  Set a resend cooldown of at least 60 seconds and a low hourly cap per phone number.
- Password recovery / magic link:
  Keep a resend cooldown of at least 60 seconds.

How to apply:

1. Open the Supabase dashboard for this project.
2. Go to `Authentication`.
3. Review the provider-level rate-limit and anti-abuse settings.
4. Match them to the app-side cooldowns now enforced in [auth-helpers.ts](/c:/Users/ahmed/OneDrive/Documents/Syslab/Projects/COACHos/coachos/src/lib/auth-helpers.ts).

Why this still matters:

- The frontend can slow normal users down.
- The database can throttle protected RPCs and table inserts.
- Supabase Auth endpoints still need dashboard-side limits because they can be hit outside the app UI.
