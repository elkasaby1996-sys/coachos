# Migration Runbook

Use this process for all schema/data migrations.

## Local Authoring Flow

1. Create a migration file:

```bash
npm run supabase:migration:new -- add_feature_name
```

2. Add SQL to the new file in `supabase/migrations`.
3. Start the local database:

```bash
npm run supabase:start
```

4. Apply pending local migrations:

```bash
npm run supabase:migration:up
```

5. Lint the local database:

```bash
npm run supabase:db:lint
```

6. If you add pgTAP coverage later, run:

```bash
npm run supabase:db:test
```

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

## GitHub Deploy Flow

1. Merge the migration PR into `main`.
2. `Supabase Deploy Staging` runs automatically on `main` for Supabase-related changes.
3. Confirm the staging database and app behavior.
4. Trigger `Supabase Deploy Production` manually from GitHub Actions. Each deploy workflow reads `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, and `SUPABASE_DB_PASSWORD` from its GitHub environment.
5. Re-run post-deploy checks after production push.

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

## Migration History

Do not delete historical migration files from `supabase/migrations` once they are part of the repository history and deployed environments. If the project needs a cleaner baseline later, plan a dedicated squash/re-baseline migration and coordinate it across environments.
