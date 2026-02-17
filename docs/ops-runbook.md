# Ops Runbook

This runbook is for day-to-day technical support and incident handling for CoachOS.

## Scope

- Production app availability
- Authentication and user access issues
- Data integrity and migration incidents
- CI/CD pipeline failures

## Systems Of Record

- App hosting and deploys: Netlify
- Database and auth: Supabase
- Source control and CI: GitHub + GitHub Actions
- Error tracking: Sentry (if enabled)

## Access Prerequisites

- Netlify site admin access
- Supabase project admin access
- GitHub repo write/admin access
- Sentry project access (optional until launch)

## Severity Levels

- `SEV-1`: Full outage, login broken for all users, data loss risk
- `SEV-2`: Core workflow degraded for many users
- `SEV-3`: Isolated user issue or minor degradation

## First 10 Minutes (Any Incident)

1. Confirm impact: one user vs many users.
2. Check current deploy in Netlify and recent GitHub Actions runs.
3. Check Supabase status and recent SQL migrations.
4. If issue is widespread, pause new deploys and communicate status.
5. Start an incident note: timestamp, symptoms, actions taken.

## Playbooks

### 1) Users Cannot Log In

1. Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Netlify env vars.
2. Check Supabase Auth logs for errors (invalid JWT, rate limits, provider errors).
3. Confirm frontend is loading (not white screen / JS crash) in browser console.
4. If tied to latest deploy, rollback in Netlify to previous successful deploy.
5. Re-test `/login` with a known test account.

### 2) PT Cannot See Clients / Client Data Missing

1. Confirm user role resolution in app (`pt` vs `client`) using affected account.
2. Check `workspace_members` and `clients` records in Supabase.
3. Validate recent RLS/policy or migration changes.
4. If migration caused regression, apply hotfix migration via PR and deploy.
5. Re-run smoke E2E after fix.

### 3) Production Build/Deploy Fails

1. Open Netlify deploy logs and identify failing step.
2. Check latest merged PR and GitHub Action run logs.
3. Reproduce locally: `npm ci`, `npm run lint`, `npm run build`.
4. If urgent, rollback deploy in Netlify.
5. Fix on a branch, open PR, wait for green CI, merge.

### 4) CI Is Red (GitHub Actions)

1. Run: `gh run list --limit 5`
2. Inspect failing run: `gh run view <run_id> --log-failed`
3. Classify failure:
   - test regression
   - missing secret/config
   - flaky test
4. Fix in branch and re-run CI.
5. Do not bypass protected-branch checks unless true emergency.

### 5) Suspected Database/RLS Issue

1. Identify exact query/table failing.
2. Check relevant migration history in `supabase/migrations/`.
3. Verify policies in Supabase SQL editor.
4. Prepare reversible migration fix in PR.
5. Validate with smoke E2E and affected user flow before merge.

## Rollback Procedure

### App Rollback (Netlify)

1. Netlify -> Deploys -> select last known-good deploy.
2. Click "Publish deploy".
3. Re-test `/health` and `/login`.

### Code Rollback (GitHub)

1. Revert offending merge commit on a new branch.
2. Open PR with clear incident context.
3. Merge after checks/review.

## Post-Incident Checklist

1. Record root cause and timeline.
2. Add prevention task (test, alert, guardrail, docs update).
3. Update this runbook if process changed.
4. Share short incident summary with stakeholders.

## Routine Weekly Ops Checks

1. Verify latest CI runs are green.
2. Verify Netlify production deploy is healthy.
3. Spot-check `/health`, `/login`, `/pt/dashboard`, `/app/home`.
4. Review Supabase auth/database error logs.
5. Triage and close stale operational TODOs.
