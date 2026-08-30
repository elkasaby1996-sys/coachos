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
  "limit": 24,
  "cursor": null
}
```

The gateway validates every field, rejects unknown fields, permits limits from
1 through 50, and makes exactly one fixed-route provider request per call.
Name, body-part, equipment, and target filtering remain frontend-local because
the current provider integration does not document equivalent upstream query
parameters. Upstream filtering belongs in PR-EXLIB-02 after the provider
contract is confirmed.

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
`ExerciseDatasetPage { exercises, nextCursor }`. Errors return only a stable
code, safe copy, and correlation ID—never provider headers, credentials, raw
tokens, stack traces, or large provider payloads.

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
4. Inspect browser network traffic and confirm the provider hostname is absent.
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
