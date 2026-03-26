# CoachOS

CoachOS is a web-first SaaS prototype for personal trainers and clients. The app includes a PT workspace with dashboards, templates, and client management, plus a mobile-friendly client portal.

## Tech Stack

- Vite + React + TypeScript
- TailwindCSS + shadcn/ui patterns
- React Router
- Supabase (auth + postgres + storage)
- TanStack Query
- Recharts
- react-hook-form + zod

## Getting Started

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment variables

Create a `.env` file in the project root:

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3) Run the dev server

```bash
npm run dev
```

## Demo seed helpers

A lightweight seed helper script is included in `src/lib/seed.ts` with example data structures to guide your Supabase seeding workflow.

## Scripts

- `npm run dev` - start the dev server
- `npm run build` - typecheck + build
- `npm run preview` - preview production build
- `npm run lint` - run ESLint (flat config)
- `npm run format` - check Prettier formatting
- `npm run format:write` - apply Prettier formatting
- `npm run supabase:start` - start local Supabase DB services
- `npm run supabase:stop` - stop local Supabase services
- `npm run supabase:status` - show local Supabase service status
- `npm run supabase:migration:new -- <name>` - create a new migration file
- `npm run supabase:migration:up` - apply pending local migrations
- `npm run supabase:migration:list` - compare local and remote migration history
- `npm run supabase:db:reset` - reset and rebuild the local database from migrations
- `npm run supabase:db:lint` - lint the local database schema
- `npm run supabase:db:test` - run pgTAP database tests when present
- `npm run verify:release` - full release gate check
- `npm run test:e2e:smoke` - run Playwright smoke E2E tests

## Supabase Migration Flow

1. Create a migration:

```bash
npm run supabase:migration:new -- add_feature_name
```

2. Edit the generated SQL file in `supabase/migrations`.

3. Start the local database and apply migrations:

```bash
npm run supabase:start
npm run supabase:migration:up
```

4. Validate locally:

```bash
npm run supabase:db:lint
```

5. Open a PR. `Supabase CI` will validate the local database and migrations.

6. After merge to `main`, the staging workflow pushes pending migrations to the staging Supabase project.

7. Promote to production with the manual `Supabase Deploy Production` workflow.

Historical migration files in `supabase/migrations` are intentionally preserved. If the project ever needs a clean baseline, use a planned squash/re-baseline process instead of deleting committed migration history.

## Supabase GitHub Secrets

Set these repository or environment secrets before using the deploy workflows:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_ID`
- `SUPABASE_DB_PASSWORD`

Use environment-scoped secrets so `supabase-staging` points to staging and `supabase-production` points to production.

## E2E Smoke Setup

1. Copy `.env.e2e.example` to `.env.e2e` and fill values.
2. Install Playwright browsers:

```bash
npx playwright install
```

3. Run smoke tests:

```bash
npm run test:e2e:smoke
```

## CI Secrets For Smoke E2E

Set these repository secrets in GitHub Actions:

- `E2E_BASE_URL` (optional if your app is already hosted for smoke runs)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `E2E_PT_EMAIL`
- `E2E_PT_PASSWORD`
- `E2E_CLIENT_EMAIL`
- `E2E_CLIENT_PASSWORD`
- `E2E_CLIENT_ID`
- `E2E_WORKOUT_TEMPLATE_ID`

## Public Routes For Launch

- `/privacy`
- `/terms`
- `/support`
- `/health` (uptime probe target)

## Release Process Docs

- Go/No-Go checklist: `docs/release-go-no-go.md`
- Migration runbook: `docs/migration-runbook.md`
- Ops/monitoring checklist: `docs/ops-monitoring-checklist.md`
- Ops incident runbook: `docs/ops-runbook.md`
- Lint warnings triage: `docs/docs-lint-triage.md`
- GitHub operations guide: `docs/github-operations.md`
