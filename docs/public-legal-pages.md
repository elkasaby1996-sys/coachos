# Public legal policies

The operator confirmed **RepSync** as the exact legal operator name. The supplied Terms of Service, Privacy Policy, and Refund and Cancellation Policy are effective September 18, 2026. The Terms distinguish RepSync software from the independent coach's services, nutrition guidance, and medical advice. This copy does not assert Paddle approval or change the active billing provider.

`src/lib/legal-site.ts` is the single operator, effective-date, metadata, and indexing configuration. The approved documents live in `src/content/legal/`. They share one renderer across the public React routes and the static initial HTML emitted by `scripts/legal-pages-build.tsx`.

`/privacy`, `/terms`, and `/refunds` are outside authentication guards. Their public footer links are Privacy Policy, Terms of Service, and Refund Policy. The production build includes complete HTML documents at these routes so reviewers can read them without JavaScript, credentials, or a live backend. Netlify's existing non-forced SPA fallback allows these files to be served directly. No deployment or provider configuration is performed by this change.

Both `robots` and `googlebot` use the same operator validation. A blank or placeholder operator suppresses the policy body and sets `noindex,nofollow`; it is never substituted into published copy. With the confirmed operator, all three use `index,follow` and appear in the public sitemap. If the operator is cleared for a future review, remove those sitemap entries as well. No approval identity or company registration is inferred from the brand name.

Verify with the legal and marketing unit contracts, `npm run build`, and `npx playwright test --config tests/e2e/public-marketing.config.ts`. That public-only configuration uses a local production preview, starts no database, and seeds no accounts. It checks anonymous reachability, full policy sections, metadata, all footer links, responsive layout, and JavaScript-disabled access. The wider E2E smoke suite also covers the public routes.

## Paddle readiness gate

Run `npm run legal:readiness` with Node 22.18+ before committing or releasing this legal-page change. It exits nonzero while the operator or approved business-support phone is missing. Build success does **not** imply legal release readiness. The operator has now supplied and explicitly approved the business-support number. The readiness check passes with no blockers; deployment remains a separate step.

The operator must supply their real, publicly usable business phone in `legalSiteConfig.supportPhone`, in international format (`+` followed by country code and digits). After confirming that the business controls the number and it reaches buyer support, set `supportPhoneApproved: true`. Do not copy a test fixture or example number. Validation rejects blank values, text placeholders, malformed numbers, repeated/sequential dummy numbers, and common reserved example ranges. No format validator proves ownership; the separate approval flag records that manual verification. Missing, invalid, or unapproved values render no phone text or telephone link. Approved values appear in Terms, Refund Policy (including generated HTML), and Support. Support email remains `support@repsync.com`.

Indexing still follows the confirmed legal-operator gate. The phone requirement is a separate commit/release gate, not a reason to change the approved operator or to publish a placeholder.

The Terms include the exact requested Paddle reseller statement in section 8. It is scoped to purchases through Paddle because checkout is not integrated yet. RepSync's responsibility for the software remains explicit. When Paddle becomes the active reseller, its integration must align the surrounding payment-provider wording across Terms and Refund Policy with the definitive purchase flow. This change does not activate Paddle or claim approval.

## Future checkout acceptance requirement

Before creating a Paddle checkout or completing purchase, present linked Terms of Service and Refund Policy and require the buyer to accept the Terms and acknowledge the Refund Policy. Do not preselect acceptance. The integration must enforce this before checkout creation, record the accepted policy versions/time, and test rejection when either acknowledgement is absent. This is a future integration requirement, not implemented payment behavior in this PR.

The existing 14-day no-card trial is unchanged. No 30-day money-back guarantee has been added. Paddle lists that guarantee under best practices, separately from its policy requirements. The [Paddle seller handbook](https://www.paddle.com/seller-guides/seller-handbook) specifies the reseller statement, buyer-support email/phone, and policy acceptance.

## Public wording audit

Reviewed public page sources (including home HTML, product, coach/client audiences, coach directory, comparisons, FAQ, support, security, and legal pages), shared marketing/product content, and the commercial catalogue. Searched personal training, human coaching, weight loss/lose weight, muscle building, medical, treatment, diet prescription, we coach, our coaches, and nutrition advice, then reviewed the broader nutrition/program wording in context.

No reviewed marketing claim says RepSync supplies coaches or directly sells health advice. Coach directory listings and product demonstrations describe independent coaches and software features. The small delta clarifies the shared client-preview description, nutrition-preview caption, and medical-advice FAQ: coach-created programs, coach-defined nutrition targets, software tools for independent fitness professionals. Legitimate assignment/tracking capabilities, independent coach descriptions, and competitor feature descriptions remain intact. The [Paddle AUP](https://www.paddle.com/help/start/intro-to-paddle/what-am-i-not-allowed-to-sell-on-paddle) informs this positioning review; this is not a claim of Paddle approval.

## Domain review checklist

| Requirement                   | Local implementation                                                       | Before Paddle submission              |
| ----------------------------- | -------------------------------------------------------------------------- | ------------------------------------- |
| Product description           | Public `/` and `/product`                                                  | Verify live HTTPS                     |
| Pricing and capacities        | Public `/pricing`                                                          | Verify live HTTPS                     |
| Features/deliverables         | Public `/product`, pricing comparison                                      | Verify live copy                      |
| Terms, Privacy, Refund Policy | Public `/terms`, `/privacy`, `/refunds`; footer links; full initial HTML   | Verify all three live without login   |
| Legal operator                | RepSync displayed in Terms                                                 | Confirm deployed copy                 |
| Metadata                      | No Interim titles; index/follow with confirmed operator; refunds canonical | Inspect live HTML                     |
| Buyer support email           | Terms, Refund Policy, `/support`                                           | Verify contact works                  |
| Buyer support phone           | Operator-supplied number approved and configured                           | Verify live telephone link            |
| Software positioning          | Independent coach responsibilities explicit                                | Preserve during checkout integration  |
| Checkout acceptance           | Documented future integration requirement                                  | Implement before Paddle purchase flow |
| Live HTTPS domain             | Not deployed by this task                                                  | Deploy and verify before submission   |

The [Paddle domain verification requirements](https://www.paddle.com/help/start/account-verification/what-is-domain-verification) are the basis for the public-page checklist. After the phone is supplied and the readiness check passes: commit/PR, CI, review/merge, authorized deployment, manually verify `/`, `/pricing`, `/terms`, `/privacy`, `/refunds` over HTTPS, then submit the domain. Do not treat local tests as evidence that the live domain has been updated.

Proposed commit: `Finalize public legal policies for Paddle domain review`.

Proposed PR title: `Finalize RepSync public legal policies and Paddle review requirements`.

## Local verification — September 18, 2026

| Check                          | Final result                                                                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legal/marketing unit tests     | 65 passed across 6 files: public legal policies, marketing public contract, commercial catalogue marketing contract, product page content, marketing funnel data, marketing leads/switch SQL contract |
| Public marketing Chromium E2E  | 33 passed; isolated production preview, empty browser session, no database seeding                                                                                                                    |
| Typecheck and production build | `npm run build` (`tsc -b && vite build`) passed                                                                                                                                                       |
| Lint                           | Passed, 0 errors; 3 unchanged warnings in client profile inputs, client messages, and client workout run                                                                                              |
| Formatting                     | Repository-wide Prettier check passed                                                                                                                                                                 |
| Whitespace                     | `git diff --check` passed                                                                                                                                                                             |
| Release readiness              | Exit 0: no blockers, `PADDLE_LEGAL_PR_READY`                                                                                                                                                          |
| Visual check                   | Support at 375px inspected; contact link visible and no horizontal overflow. Legal layouts covered at phone/tablet/desktop widths                                                                     |
| Remote actions                 | None: no commit, push, deployment, or payment-provider integration                                                                                                                                    |

| Public route | Anonymous local check | Additional evidence                                                      |
| ------------ | --------------------- | ------------------------------------------------------------------------ |
| `/`          | PASS                  | Product description, responsive layout                                   |
| `/pricing`   | PASS                  | Prices, capacities, 14-day trial entry                                   |
| `/product`   | PASS                  | Purchased software features/deliverables                                 |
| `/terms`     | PASS                  | Full no-JavaScript HTML; reseller clause; RepSync operator; index/follow |
| `/privacy`   | PASS                  | Full no-JavaScript HTML; RepSync operator; index/follow                  |
| `/refunds`   | PASS                  | Full no-JavaScript HTML; canonical metadata; index/follow                |
| `/support`   | PASS                  | Approved telephone link and email on the actual routed page              |

These results cover the local build, not the deployed domain. Live HTTPS verification remains a post-deployment step.

## Changed-file inventory

The existing branch remains uncommitted. Its complete legal-page change includes:

```text
docs/marketing-site-launch-evidence.md
docs/public-legal-pages.md
package.json
public/sitemap.xml
scripts/legal-pages-build.tsx
scripts/paddle-legal-readiness.ts
src/components/common/app-footer.tsx
src/components/common/buyer-support-contact.tsx
src/content/legal/policy-content.tsx
src/content/legal/privacy.tsx
src/content/legal/refunds.tsx
src/content/legal/terms.tsx
src/lib/i18n.tsx
src/lib/legal-site.ts
src/lib/marketing-public.ts
src/pages/public/legal-policy.tsx
src/pages/public/marketing-content.tsx
src/pages/public/privacy.tsx
src/pages/public/public-site-shell.tsx
src/pages/public/refunds.tsx
src/pages/public/support.tsx
src/pages/public/terms.tsx
src/routes/app.tsx
src/routes/lazy-pages.ts
src/styles/legal-policy.css
src/styles/support.css
tests/e2e/public-marketing.config.ts
tests/e2e/public-marketing.spec.ts
tests/e2e/utils/server-readiness.ts
tests/unit/marketing-public-contract.test.ts
tests/unit/public-legal-policies.test.ts
vite.config.ts
```
