# RepSync Marketing Site Launch Evidence

Date: 2026-07-12

## Implementation Summary

PR-MKT-WEB-04 completes the public trust, security, FAQ, legal draft, cookie consent, SEO, public-profile metadata, and launch QA surface for the RepSync marketing site.

The implementation preserves the existing warm ivory, pale sage, forest green, editorial marketing system. It does not redesign the homepage, authenticated application, login, signup, invitation, or coaching workflows.

## Route Inventory

Indexable marketing routes:

- `/`
- `/product`
- `/for-coaches`
- `/for-clients`
- `/switch`
- `/compare/truecoach`
- `/compare/fitr`
- `/faq`
- `/security`
- `/request-access`
- `/privacy`
- `/terms`
- `/cookies`

Public profile route:

- `/p/:ptSlug` is indexable only when a published profile is returned by the public profile query.
- Unavailable, invalid, loading, draft, or unpublished profile states use `noindex,nofollow` metadata.

Excluded from sitemap:

- Login, signup, invite, team-invite, authenticated app, and workspace routes.

## Environment Variables

Client:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- Optional Sentry variables already supported by the app: `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`, `VITE_SENTRY_RELEASE`, `VITE_SENTRY_*` sampling/logging variables.

Edge Function:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- Optional notification variables: `RESEND_API_KEY`, `MARKETING_LEADS_NOTIFY_EMAIL`, `MARKETING_LEADS_FROM_EMAIL`.

No remote Supabase commands were run for this PR.

## Migration Status

No new migration was added for PR-MKT-WEB-04.

Existing PR-MKT-WEB-02 migration remains present:

- `supabase/migrations/20260712120000_marketing_switch_funnel_hardening.sql`

## Edge Function Status

No Edge Function code was changed for PR-MKT-WEB-04.

Existing marketing lead submission behavior remains:

- Client validation and duplicate prevention in the public form.
- Server-side enum and consent validation.
- Honeypot handling.
- Marketing lead persistence.
- Resend notification attempt does not block successful user response.
- Generic server error response.

## Resend Status

Resend behavior is implemented but not live-verified in this local run because production/staging Resend credentials and deployment were not exercised.

Production launch gate: send and receive both request-access and switch notifications in staging or production with the intended sender domain.

## Form Submission Proof

Automated Playwright coverage verifies:

- Request-access validation.
- Request-access successful submission with duplicate-submit prevention.
- Switch form required fields.
- Switch form retryable backend failure state.

Local tests mock the Edge Function network response; they do not prove live Supabase or Resend delivery.

## Analytics Proof

Marketing analytics dispatch is gated by `repsync_analytics_consent`.

Verified behavior:

- No marketing analytics custom event is dispatched before analytics consent is accepted.
- Reject optional persists `rejected`.
- Reopen preferences from footer works.
- Accept analytics persists `accepted`.
- Analytics dispatch is wrapped so failure cannot block navigation or form interaction.

Analytics payload rules:

- No email.
- No person name.
- No business name.
- No free-text form content.
- No client data.
- No health data.
- No private identifiers.

## Consent Proof

Consent categories:

- Essential: always available.
- Analytics: optional and off until accepted.

User controls:

- Accept analytics.
- Reject optional.
- Manage preferences from footer.
- Persisted in local storage.
- Rejection is no harder than acceptance.

## SEO Proof

Implemented or verified:

- Unique titles and descriptions for required public routes.
- Canonical URLs through the shared marketing metadata hook.
- Open Graph title, description, URL, and image.
- Twitter summary large image metadata.
- `robots` meta for marketing pages.
- `public/robots.txt` with sitemap declaration.
- `public/sitemap.xml` with required marketing routes.
- Organization structured data.
- SoftwareApplication structured data without ratings, offers, or fake pricing.
- FAQ structured data generated from visible FAQ content.
- Breadcrumb structured data on major marketing pages.

## Sitemap Proof

Static sitemap includes the required marketing routes and excludes authenticated app routes.

Public profile sitemap strategy:

- Do not statically include draft/private profiles.
- Generate profile sitemap entries only from published public profile records.
- If using marketplace listing for a sitemap source, include only records with published status and a public slug; marketplace visibility may further restrict directory inclusion.
- Do not include private contact details, workspace IDs, or private workspace fields in generated sitemap metadata.

## Robots Proof

`public/robots.txt`:

- Allows public crawling.
- Declares `https://www.repsync.com/sitemap.xml`.

App/auth routes remain excluded from the public sitemap and should be protected or noindexed by their app flows where relevant.

## Published-Profile Indexing Proof

Public profile query behavior verified from repository:

- `usePublicPtProfile` filters by slug and `is_published = true`.
- Public marketplace listing filters `is_published = true` and `marketplace_visible = true`.
- Unavailable profile states render a controlled unavailable state.
- Public profile metadata sets `noindex,nofollow` while loading or unavailable.
- Returned published profiles set coach-specific title, description, canonical URL, and social image fallback.

## Mobile QA Results

Automated Playwright coverage checks:

- 375px render and no horizontal overflow for all required marketing routes.
- 320px, 768px, and 1280px responsiveness for product and audience pages.
- Consent banner is responsive through public marketing route checks.

Manual launch checklist still required at 390px, 1024px, and 1440px+ across all pages.

## Browser QA Results

Automated coverage run:

- Playwright Chromium.

Blocked in this local pass:

- Playwright Firefox.
- Playwright WebKit.
- Native Safari.
- Microsoft Edge.

The dedicated browser-matrix config was added at `tests/e2e/public-marketing-browsers.config.ts`, but the local Playwright cache does not currently include the Firefox/WebKit browser binaries. Firefox failed before page execution with a missing executable under `AppData\Local\ms-playwright` and Playwright's `npx playwright install` guidance.

Launch gate: run Playwright browser matrix or equivalent smoke checks before production.

## Accessibility Results

Implemented:

- Skip link.
- Semantic landmarks.
- Accessible FAQ details/summary controls.
- Accessible consent dialog labeling.
- Visible focus inherited from marketing shell.
- No color-only availability language.
- Reduced motion support retained.
- Form labels and status announcements retained.

Automated accessibility tooling was not added in this PR.

## Performance Results

Measured:

- Production build completed successfully.

Not measured:

- Lighthouse Performance, Accessibility, Best Practices, and SEO scores.
- LCP, CLS, and third-party script timings.

Performance launch gate: run Lighthouse or equivalent on the required public routes after deployment.

## Build And Test Commands

Commands run during implementation and final verification:

- `python .codex/skills/ui-ux-pro-max/scripts/search.py "RepSync trust security legal FAQ consent public marketing launch warm ivory sage" --design-system -p "RepSync"`
- `npx vitest run tests/unit/marketing-public-contract.test.ts tests/unit/marketing-funnel-data.test.ts tests/unit/marketing-leads-switch-funnel-sql-contract.test.ts` - passed, 26 tests.
- `npm run test:unit` - passed, 1014 tests across 201 files.
- `npx playwright test tests/e2e/public-marketing.spec.ts` - passed, 23 Chromium tests.
- `npx playwright test tests/e2e/public-marketing.spec.ts --config tests/e2e/public-marketing-browsers.config.ts --project=firefox --grep "renders / without mobile overflow" --reporter=line` - blocked by missing local Firefox browser executable.
- `npm run lint` - passed.
- `npm run build` - passed.

## Known Limitations

- Legal copy is a conservative draft, not human-approved legal advice.
- Resend delivery was not live-verified in this local run.
- Remote Supabase deployment and production secrets were not touched.
- Public-profile sitemap generation strategy is documented but not connected to a live sitemap generator in this PR.
- No Lighthouse scores were measured.
- Browser matrix beyond Chromium requires installing the local Playwright Firefox/WebKit binaries or running equivalent smoke checks in an environment that already has them.

## Legal Review Status

Legal review required before production launch.

Configured legal status:

- Business name: RepSync
- Legal entity name: RepSync
- Jurisdiction: Legal review pending
- Effective date: 2026-07-12
- Version: draft-public-launch-2026-07-12
- Approval: not documented

## Content Approval Status

Product, security, FAQ, legal draft, consent, and metadata content is implementation-ready but needs stakeholder approval before production launch.

## Production Launch Blockers

- Human legal review and approval of privacy notice, terms, and cookie notice.
- Production/staging Resend verification.
- Production Supabase auth redirect allow-list verification.
- Production environment variable verification.
- Browser matrix smoke checks beyond Chromium.
- Lighthouse or equivalent performance/accessibility/SEO checks.
- Public profile sitemap generation connected to production-safe published-profile source if profile indexing is desired at scale.

## Go/No-Go Recommendation

No-go for production until legal review, email delivery verification, production environment checks, browser matrix smoke, and performance/accessibility measurements are complete.

Go for continued staging QA.
