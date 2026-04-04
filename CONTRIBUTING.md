# Contributing To Repsync

Thanks for contributing to Repsync. This repo ships both application code and Supabase schema history, so changes should be made with a release mindset rather than as isolated code edits.

## Core Workflow

1. Branch from `main`.
2. Make the smallest coherent change that solves the problem.
3. Run the relevant local checks before opening a PR.
4. Update [`docs/session-journal.md`](docs/session-journal.md) with a dated entry summarizing the session, files changed, commands run, blockers, repo state, and next step.
5. Open a PR using the repository template.
6. Merge only after required checks pass and review feedback is addressed.

## Session Journal

`docs/session-journal.md` is required workflow state for this repo.

- Read the latest entry before starting work on a new machine or in a new session.
- Append a new dated entry after any meaningful work session.
- Include timestamps when known, and clearly mark times as approximate when they were not captured live.
- Do not rewrite old entries unless you are correcting factual errors; add follow-up notes instead.

## Branch Naming

Use short, descriptive branch names:

- `feature/<name>`
- `fix/<name>`
- `refactor/<name>`
- `chore/<name>`
- `db/<name>`

Examples:

- `feature/client-notes`
- `fix/checkin-status-pill`
- `db/nutrition-reminder-index`

## Pull Requests

Every PR should include:

- a clear summary of the user or operator impact
- the risk level
- a rollback plan
- notes on migrations, if any

Before opening a PR, run the baseline checks:

```bash
npm run lint
npm run format
npm run build
```

For database changes, also run:

```bash
npm run supabase:start
npm run supabase:db:reset
npm run supabase:db:lint
```

If a change affects smoke-tested flows, run:

```bash
npm run test:e2e:smoke
```

## UI And Design Changes

Before changing page-level UI, review the design docs in this order:

1. `design-system/repsync/MASTER.md`
2. `design-system/repsync/pages/<page>.md` when available
3. `docs/repsync-ui-playbook.md`

For UI work, prefer extending the existing surface, spacing, typography, and interaction patterns instead of creating a brand-new visual language per page.

## Supabase Changes

Create new migrations with:

```bash
npm run supabase:migration:new -- add_feature_name
```

Then:

1. edit the generated SQL in `supabase/migrations`
2. validate locally with `supabase:db:reset` and `supabase:db:lint`
3. include app code and migration SQL in the same PR when they depend on each other

Do not delete historical migration files from `supabase/migrations`. If schema history needs cleanup, use a planned re-baseline or squash process.

## Review Expectations

Reviewers should prioritize:

- regressions in behavior
- schema safety and rollbackability
- auth and RLS changes
- production risk
- missing validation or tests

## Commit Guidance

Commit messages should be short and descriptive. Conventional commits are welcome but not required. Good examples:

- `Add Supabase CI and deploy workflows`
- `Fix PT Hub profile publication lint issue`
- `Refine check-in status row spacing`

## Security

Never commit:

- Supabase access tokens
- database passwords
- service-role keys
- JWT signing keys
- production-only secrets

If sensitive data is exposed in terminal output, logs, or a PR, rotate it immediately and update GitHub secrets.
