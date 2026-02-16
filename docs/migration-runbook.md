# Migration Runbook

Use this process for all schema/data migrations.

## Pre-Deploy

1. Confirm backups/snapshots are available.
2. Review migration SQL for:
   - explicit schema qualification (`public.table`)
   - lock-heavy operations
   - backwards compatibility
3. Validate migration on staging first.
4. Prepare rollback SQL or compensating migration.

## Deploy

1. Apply migration in staging.
2. Run sanity checks:

```sql
select now();
```

```sql
-- Example: confirm hardened RPCs exist
select proname, prosecdef
from pg_proc
where proname in ('pt_dashboard_summary', 'pt_clients_summary', 'assign_workout_with_template');
```

3. Validate app flows against staging.
4. Apply migration in production during low traffic window.

## Post-Deploy

1. Re-run sanity queries in production.
2. Run smoke checks:
   - PT login + dashboard
   - assign workout
   - client check-in submit
   - PT review
3. Monitor error rate for 30-60 minutes.

## Rollback

1. If release fails, stop deploy and revert app to last stable tag.
2. Apply rollback SQL (or follow compensating migration plan).
3. Confirm critical flows are restored.
