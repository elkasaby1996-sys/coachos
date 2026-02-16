# Release Go/No-Go Checklist

Use this checklist for every production release.

## 1. Code Health

- [ ] `npm run lint` passes (warnings tracked in `docs-lint-triage.md`)
- [ ] `npm run format` passes
- [ ] `npm run build` passes
- [ ] All migration files are committed and reviewed

## 2. CI Health

- [ ] GitHub `quality` check is green
- [ ] GitHub `smoke-e2e` check is green
- [ ] Smoke tests executed (not skipped)

## 3. Staging Validation

- [ ] PT login/logout works
- [ ] Client login/logout works
- [ ] PT workspace onboarding works
- [ ] Client onboarding works
- [ ] PT can assign workout
- [ ] Client can submit check-in
- [ ] PT can review check-in feedback

## 4. Database & Security

- [ ] New migrations applied successfully on staging
- [ ] Post-migration sanity queries pass
- [ ] RLS/policy review completed for touched tables
- [ ] `SECURITY DEFINER` functions include explicit auth checks

## 5. Operations

- [ ] Rollback plan identified for this release
- [ ] Previous stable tag documented
- [ ] Error monitoring configured and reachable
- [ ] Uptime checks enabled for critical routes

## 6. Product/Compliance

- [ ] Privacy Policy link is valid
- [ ] Terms link is valid
- [ ] Support/contact route is visible

## Go/No-Go Decision

- [ ] GO
- [ ] NO-GO

Decision owner:

Date:
