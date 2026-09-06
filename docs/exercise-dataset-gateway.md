# Exercise Dataset Gateway

RepSync browser code must call the authenticated `exercise-dataset-search`
Supabase Edge Function. Only that function may call the current exercise
provider or attach its credential.

## Server-only configuration

Configure these names as Edge Function secrets. Never put them in a Vite env
file and never commit real values.

- `EXERCISE_DATASET_BASE_URL` — provider origin/base path used before the fixed
  `/api/v1/exercises` route.
- `EXERCISE_DATASET_API_KEY` — provider credential.
- `EXERCISE_DATASET_API_KEY_HEADER` — provider credential header name; defaults
  to `x-api-key` when omitted locally.
- `EXERCISE_DATASET_API_HOST` — optional provider host header value.

When the current Open Wearables server configuration already exists, the
gateway also accepts the server-only `OPEN_WEARABLES_API_URL` and
`OPEN_WEARABLES_API_KEY` names. The generic `EXERCISE_DATASET_*` pair takes
precedence when configured. The Open Wearables fallback uses the existing
`X-Open-Wearables-API-Key` server header and never exposes it to frontend code.

The public RepSync request contract remains provider-neutral. The gateway maps
`name`, `bodyPart`, `equipment`, `target`, and `exerciseType` to the current
provider's `name`, `bodyParts`, `equipments`, `targetMuscles`, and
`exerciseType` query parameters. RepSync's opaque `cursor` maps to the
provider's documented `after` parameter; provider `before` pagination is not
exposed because the UI only requests forward pages.

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the
function runtime. They must also remain server-only.

For local development, add placeholder or local provider values to the ignored
`supabase/.env.local` file:

```bash
EXERCISE_DATASET_BASE_URL=https://provider-host.example
EXERCISE_DATASET_API_KEY=<local-provider-key>
EXERCISE_DATASET_API_KEY_HEADER=x-api-key
EXERCISE_DATASET_API_HOST=
```

Serve the function locally:

```bash
npx supabase@latest functions serve exercise-dataset-search --env-file supabase/.env.local
```

The function requires a valid RepSync bearer token and PT authorization. A
request without a valid session returns `401`; an authenticated non-PT account
returns `403`.

## Request and response

Route:

```text
POST /functions/v1/exercise-dataset-search
```

Request body:

```json
{
  "name": "press",
  "bodyPart": "",
  "equipment": "",
  "target": "",
  "exerciseType": "",
  "limit": 24,
  "cursor": null
}
```

Exercise-library dropdown metadata uses the same authenticated gateway. The
body contains exactly one allow-listed metadata key:

```json
{
  "metadata": "equipments"
}
```

Allowed metadata values are `muscles`, `bodyparts`, `equipments`, and
`exercisetypes`. They map only to the matching fixed `/api/v1/...` provider
routes; arbitrary paths and mixed metadata/search bodies are rejected.

An exercise preview uses the same authenticated gateway with a strict detail
body:

```json
{
  "exerciseId": "provider-exercise-id"
}
```

The gateway validates every field, rejects unknown fields, permits limits from
1 through 50, and makes exactly one fixed-route provider request per call. The
current provider adapter maps neutral search fields to its documented `name`,
`bodyParts`, `equipments`, `targetMuscles`, `exerciseType`, and `after`
parameters. Detail requests accept only a bounded provider ID and map it to the
provider's fixed `/api/v1/exercises/{exerciseId}` route; caller-controlled URLs
and mixed search/detail bodies are rejected.

Success returns the bounded provider payload to the exercise dataset service:

```json
{
  "providerPayload": {
    "data": []
  },
  "correlationId": "generated-request-id"
}
```

The frontend service continues normalizing that payload into
`ExerciseDatasetPage { exercises, nextCursor }` for list requests and one
`ProviderNormalizedExercise` for detail requests. The provider catalog renders
lazy static thumbnails, then requests detail only when a trainer opens Preview.
The returned MP4 uses click-to-play browser controls with `preload="none"`.
Errors return only a stable code, safe copy, and correlation ID—never provider
headers, credentials, raw tokens, stack traces, or large provider payloads.

## Deployment and credential rotation

The credential previously shipped through browser-readable `VITE_*` variables
must be treated as exposed. Do not reuse it as the new server-only credential.

Required order:

1. Create and configure a new server-only provider credential.
2. Deploy `exercise-dataset-search`.
3. Deploy the frontend version that invokes the gateway.
4. Verify browser requests go only to RepSync/Supabase and never directly to
   the provider.
5. Build the frontend and verify the old provider credential and provider-key
   Vite names are absent from `dist`.
6. Revoke the old browser-used provider credential.
7. Monitor gateway/provider error codes and correlation IDs.

Hosted changes must use the repository guard with the explicit project ref:

```bash
ALLOW_REMOTE_SUPABASE=I_UNDERSTAND_THIS_TOUCHES_REMOTE SUPABASE_PROJECT_REF=<project-ref> npm run supabase:remote -- secrets set EXERCISE_DATASET_BASE_URL=https://provider-host.example EXERCISE_DATASET_API_KEY=<new-server-only-key> EXERCISE_DATASET_API_KEY_HEADER=x-api-key EXERCISE_DATASET_API_HOST=<provider-host-if-required>
ALLOW_REMOTE_SUPABASE=I_UNDERSTAND_THIS_TOUCHES_REMOTE SUPABASE_PROJECT_REF=<project-ref> npm run supabase:remote -- functions deploy exercise-dataset-search
```

Do not use `localhost`, `127.0.0.1`, or `host.docker.internal` for hosted
Supabase secrets.

## Verification

After deployment:

1. Call the function without `Authorization` and confirm `401` with
   `unauthenticated`.
2. Call it with an authenticated client-only user and confirm `403` with
   `forbidden`.
3. Call it with an authorized PT owner/coach and confirm normalized provider
   results render in the existing library and builder.
4. Inspect browser network traffic and confirm provider API requests go only
   through the Supabase gateway. Exercise images and videos may load directly
   from the provider's credential-free media CDN.
5. Search the production bundle for the retired browser credential and the
   removed `VITE_EXERCISE_DATASET_*` names.
6. Temporarily use an invalid local provider configuration and confirm saved
   and custom library exercises remain available while provider results show a
   safe error.

## Rollback

Keep the gateway deployed while rolling back the frontend to the latest
gateway-compatible release. If the function itself is faulty, redeploy its
last known-good version. Do not restore the old direct-provider frontend and do
not reactivate the browser-used credential. During a provider or gateway
outage, saved/custom exercises remain usable and provider import/search may
degrade until the gateway is restored.
