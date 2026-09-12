# Coach-seat security boundary

Only an authenticated billing owner with a canonical PT profile and current paid provider-linked subscription can request a seat change. Commercial/provider states must be healthy and active, reconciliation processed, cancellation absent, payment processor card-backed, and mapping/quantity contract active. Trial, complimentary, custom, absent subscriptions, PayPal, unknown processors and unhealthy subscriptions cannot purchase seats.

The browser supplies only `targetAdditionalSeats` for preview; target plus `operationId` for apply; operation ID for cancel; and an empty object for refresh. Extra keys, fractional/negative/over-maximum targets and malformed IDs are rejected. Account, subscription, Item, Price, mapping, currency, amount, proration flags and effective dates are resolved server-side.

All four new tables enable RLS and deny direct access to public, anon, authenticated and service_role. Only the safe owner summary is granted to authenticated. Transition RPCs are service-only; catalogue and internal reconciliation helpers have no runtime grants. Database account locks serialize seat admission with invitations/reservations and plan changes. Triggers preserve operation identity and terminal history; the partial unique index prevents simultaneous nonterminal seat operations.

The adapter uses an injectable transport for deterministic tests, a bounded timeout and no automatic mutation retry. An ambiguous result leaves durable pending/ambiguous state. The first Item must match subscription and Price, have positive integer quantity, valid timestamps and `is_usage_based=false`. Webhook signature, environment and Store validation reuse the existing durable inbox. Payment proof is normalized and matched to an exact outstanding operation; it contains no invoice URL or payment method.

Provider quantity drift does not become approved capacity. Verified payment and current Item evidence are required for increases. Reduction preflight uses actual + pending + reserved identities; cancellation keeps the lower ceiling until source restoration is verified. Transaction rollback includes approval and operation completion.

Frontend schemas accept only safe summary/preview fields. UI and safe errors expose no provider/customer/Item/Price/invoice identifiers, raw provider objects, signed URLs, credentials or payment methods. Local operation UUIDs are opaque request identities. Logs contain safe codes and processing status only. Real provider keys and signed URLs must never be committed.

Seat code mounts only in Billing. It is not imported by AuthProvider, ThemeProvider, bootstrap, root startup, login, auth callback or a global workspace provider. No team invitation starts billing. Portal quantity changes are unsupported and Store quantity controls must stay disabled.

Historical contracts may retire without invalidating linked obligations. Activating new provider contracts and deploying this implementation require separate reviewed operations. This PR performs none. See [verification](pr-price-09-verification.md).
