# Ops & Monitoring Checklist

## Error Monitoring

- [ ] Frontend error tracking enabled (for production and staging)
- [ ] Supabase/API error logging enabled
- [ ] Alert routing configured (email/Slack/Pager)

## Uptime Checks

- [ ] `/health` health check (expects `200` and body containing `ok`)
- [ ] `/login` health check
- [ ] `/pt/dashboard` health check
- [ ] `/app/home` health check
- [ ] Region/timeouts configured

## Security Operations

- [ ] Supabase keys rotated on schedule
- [ ] Access limited by role
- [ ] Storage bucket policies reviewed
- [ ] Audit trail available for admin actions

## Incident Readiness

- [ ] On-call owner defined
- [ ] Incident template prepared
- [ ] Rollback owner defined

## Performance

- [ ] Bundle size reviewed per release
- [ ] Slow route telemetry reviewed
- [ ] Mobile performance spot-check completed
