# Command reference

This document gathers the regularly used git commands plus the Supabase/app scripts I keep restarting when working on CoachOS. The git list is drawn from the entries in `docs/session-journal.md`, so you can trace each command back to an actual session log if you need examples.

## Git commands we've been using
- `git status` – quick health check for tracked/untracked changes.
- `git status --short` – compact view of modifications before a commit/push.
- `git pull` – update the current branch with `origin`.
- `git fetch` – refresh the remote commit graph before you review or rebase.
- `git log --oneline --decorate -5` – inspect the most recent few commits with references.
- `git diff --stat` – summarize what files changed and how extensive the diff is; useful before review/commit.
- `git checkout -b <branch> origin/main` – branch off a clean `origin/main` when starting new work.
- `git commit -m "message"` – bundle staged files into a logical change.
- `git push origin <branch>` – publish work when you already have an upstream branch.
- `git push -u origin <branch>` – first time you push a branch and want to track upstream references.

## Supabase local workflow
- `npm run supabase:start` – boots the local Supabase services needed for migrations, seeds, and testing.
- `npm run supabase:status` – shows whether the Supabase services and Postgres instance are healthy.
- `npm run supabase:stop` – shuts down the local Supabase stack when you are done.
- `docker info` – useful sanity check when Supabase refuses to start (recorded during the onboarding MVP session).

### Migration & schema commands
- `npm run supabase:migration:new -- <name>` – scaffold a new migration file.
- `npm run supabase:migration:up` – apply pending local migrations to your development database.
- `npm run supabase:migration:list` – compare the history on disk with what exists in the Supabase project.

### Database validation & testing
- `npm run supabase:db:reset` – rebuild the local Postgres instance from the committed migrations if you ever need a clean slate.
- `npm run supabase:db:lint` – run the built-in schema linter before pushing schema changes.
- `npm run supabase:db:test` – execute pgTAP tests when they exist.

## App-local commands
- `npm install` – install all JS dependencies.
- `npm run dev` – start the Vite dev server (default local workflow).
- `npm run build` – typecheck and compile for production to catch build-time issues locally.
- `npm run preview` – serve the production build locally for a quick regression check.
- `npm run lint` – run ESLint on the workspace.
- `npm run format` – check formatting (Prettier/format config).
- `npm run format:write` – automatically format files in place.
- `npx playwright install` – download the Playwright browsers required for the smoke suite.
- `npm run test:e2e:smoke` – execute the Playwright smoke tests referenced in the README.

### Environment setup reminders
- Copy `.env.local.example` to `.env.local` and fill `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` before running `npm run dev`.
- Use `.env.e2e.example` as the template when you need to exercise the smoke tests or automation flows.

## Reference notes
- Supabase scripts and general app scripts are documented in `README.md` under **Getting Started** and the **Scripts** section.
- The git-session log is maintained in `docs/session-journal.md` whenever a new workflow or command becomes relevant.
