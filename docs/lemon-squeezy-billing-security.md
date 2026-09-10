# Billing security and privacy

The public webhook has `verify_jwt=false`; authentication is raw-body HMAC-SHA256 using `X-Signature`. The handler accepts POST, bounds the body to 256 KiB while streaming, reads bytes once, verifies via Web Crypto, and only then parses JSON. `X-Event-Name` must match `meta.event_name`. Configured environment and private-mapping Store must match. Malformed/signature failures return 400; transient provider/database failures return 5xx; processed, replayed, ignored and deferred events return 200.

Lemon Squeezy does not provide a documented unique delivery-event ID. The fingerprint is `sha256(environment + "\n" + event_name + "\n" + sha256(rawBytes))`, unique with provider/environment. Only the digest and allowlisted normalized fields are persisted. The database recomputes fingerprint parity, locks reconciliation and permits failed deliveries to retry. Raw body whitespace changes the fingerprint, but canonical snapshot comparison still prevents duplicate subscription effects.

Normalized delivery data contains only provider IDs, test mode, relevant dates and validated internal UUIDs. Customer names/emails, billing addresses, card/payment details, tokens, portal links, and raw JSON are discarded. The database rejects payload keys outside its allowlist. It stores no provider customer PII. Custom data from signed webhooks must match a valid local attempt; email is never ownership evidence.

All five tables enable RLS and revoke access from public, anon, authenticated and service_role. Service access uses narrow security-definer functions with fixed search paths. Only owner begin/state functions are granted to authenticated. Reconciliation is service/admin-only. Foreign keys, uniqueness, immutable mapping/customer/subscription identities and the shared account lock protect commercial history and capacity transitions.

Provider network calls use a fixed official HTTPS origin, JSON:API headers, bounded request time and disabled redirects. No user-provided URL, price, provider object ID, account ID or trial/discount option is accepted. No live-switchable fake adapter exists. Test dependencies are injected by test code.

Server-only secrets are `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_WEBHOOK_SECRET`, `BILLING_PROVIDER_ENVIRONMENT`, and `BILLING_APP_BASE_URL`. None uses a public frontend prefix. Store/Variant IDs live in private database mappings. `.env.local` and `supabase/.env.local` are gitignored. No secrets are committed or configured remotely by this PR.

Handlers log only allowlisted safe code and processing status; no raw exceptions, request/response bodies, signed URLs or provider identifiers. Browser errors map through fixed messages. Existing Sentry breadcrumbs/events/transactions redact Lemon Squeezy hosted URLs so navigation cannot retain their signatures. No provider state is imported by AuthProvider, ThemeProvider, startup, bootstrap or auth callback code.

Operations must monitor failed deliveries and provider `manual_review` records. Review failures preserve prior access; they must not be “fixed” by editing active mappings or guessing an account from customer email. Provider trials are unsupported and surface a safe operations error. A durable operations notification channel, historical resync job and manual-review UI remain future operational work; this foundation records errors and safe logs.

The migration is forward-only and atomic. Application rollback is a code revert plus a reviewed compensating forward migration, preserving all customer/subscription/delivery history. No destructive down migration or domain data rewrite is included.

Reference: [Lemon Squeezy webhook signing](https://docs.lemonsqueezy.com/help/webhooks/signing-requests).
