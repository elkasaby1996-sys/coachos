# Support requests

The public `/support` form saves requests through `submit_support_request`. It works signed out so people with account access problems can contact support. Name, email, topic, message, and an optional workspace name are stored in `public.support_requests` with a request reference and creation time.

Only the service role can read or manage requests. The submission RPC validates lengths and topics, limits each email/account to five submissions per hour, and makes retries of the same payload and request ID idempotent. The UI retains entered details when a submission fails.

The migration is applied locally. Production requires applying `20260909150000_support_requests.sql` through the normal deployment process. No remote project was modified.

Requests are stored for support operations; this form does not send email notifications. An inbox integration or support administration view can consume these records using a server-side service role. Do not expose that credential to the browser. The existing FAQ email links remain available.

Database regression checks: `npx supabase@latest test db supabase/tests/support_requests.sql`.
