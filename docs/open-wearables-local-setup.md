# Open Wearables Local Setup

Open Wearables runs as a separate integration service. RepSync stores workspace settings, client mappings, permissions, and imported metrics; Open Wearables owns provider OAuth, provider sync, and normalized provider APIs.

## Start Open Wearables

```bash
git clone https://github.com/the-momentum/open-wearables.git
cd open-wearables
cp ./backend/config/.env.example ./backend/config/.env
cp ./frontend/.env.example ./frontend/.env
docker compose up -d
```

The Open Wearables developer portal runs at `http://localhost:3000`. On a fresh local startup, use the admin account configured by `ADMIN_EMAIL` and `ADMIN_PASSWORD`; the upstream defaults are `admin@admin.com` and `your-secure-password`.

Create an API key in the developer portal, then keep it server-side only.

Optional sample data:

```bash
make seed
```

API docs are available at `http://localhost:8000/docs`.

## Configure RepSync

For local development, put the Open Wearables values in a local env file used only by `functions serve`, for example `supabase/.env.local`:

```bash
OPEN_WEARABLES_API_URL=http://host.docker.internal:8000
OPEN_WEARABLES_API_KEY=<api-key-from-open-wearables>
ALLOWED_WEARABLE_REDIRECT_ORIGINS=http://localhost:5173
```

For local Supabase running in Docker Desktop against a local Open Wearables Docker stack, prefer `host.docker.internal` from the Edge Function container. If the Edge Function is served directly on the host outside Docker, `http://localhost:8000` is also valid.

Serve the function locally:

```bash
npx supabase@latest functions serve open-wearables --env-file supabase/.env.local
```

Do not put `OPEN_WEARABLES_API_KEY` in Vite env files. The frontend calls the `open-wearables` Supabase Edge Function; only that function calls Open Wearables with `X-Open-Wearables-API-Key`.

## Remote Deploy Safety

Do not use local URLs like `localhost`, `127.0.0.1`, or `host.docker.internal` in remote Supabase secrets. Supabase cloud cannot reach those addresses.

Before deploying from GitHub Actions, configure these secrets in the target GitHub environment (`supabase-staging` and/or `supabase-production`):

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_ID`
- `SUPABASE_DB_PASSWORD`

Then set these Supabase Edge Function secrets on the target Supabase project:

- `OPEN_WEARABLES_API_URL`
- `OPEN_WEARABLES_API_KEY`
- `ALLOWED_WEARABLE_REDIRECT_ORIGINS`

If a hosted Supabase deployment is intentional, the Open Wearables API URL must be publicly reachable and the command must go through the repo guard:

```bash
ALLOW_REMOTE_SUPABASE=I_UNDERSTAND_THIS_TOUCHES_REMOTE SUPABASE_PROJECT_REF=<project-ref> npm run supabase:remote -- secrets set OPEN_WEARABLES_API_URL=https://your-open-wearables-host.example OPEN_WEARABLES_API_KEY=<real-api-key> ALLOWED_WEARABLE_REDIRECT_ORIGINS=https://your-app-domain.example
ALLOW_REMOTE_SUPABASE=I_UNDERSTAND_THIS_TOUCHES_REMOTE SUPABASE_PROJECT_REF=<project-ref> npm run supabase:remote -- functions deploy open-wearables
```

The repository deploy workflows now deploy the `open-wearables` Edge Function after migrations:

- `.github/workflows/supabase-deploy-staging.yml` runs on pushes to `main` when `supabase/**` changes.
- `.github/workflows/supabase-deploy-production.yml` runs manually through GitHub Actions.

## Provider Flow

1. Enable Wearables in Workspace Settings -> Integrations -> Wearables.
2. Allow at least one provider, such as Garmin or WHOOP.
3. A client opens Client Portal -> Wearables and chooses a provider.
4. RepSync ensures an Open Wearables user using `external_user_id = clients.id`.
5. RepSync stores the returned Open Wearables user id in `client_wearable_connections`.
6. Provider sync imports source-attributed metrics into the wearable tables only.

Wearable imports must not create or update habit logs, habit streaks, habit completions, or client lifecycle state.
