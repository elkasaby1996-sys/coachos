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
- `npm run verify:release` - full release gate check
- `npm run test:e2e:smoke` - run Playwright smoke E2E tests

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
- Lint warnings triage: `docs-lint-triage.md`
