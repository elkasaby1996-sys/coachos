# Staging commercial evidence

## Apply remote-stage evidence

New apply artifacts require `remoteStarted`, `remoteStage`,
`lastCompletedRemoteStage`, `failedRemoteStage`, and `remoteErrorCode`. Stages and
error codes use the closed vocabulary in `scripts/staging-commercial-remote-stages.mjs`.
Legacy scenario bundles can omit the entire group; omitted fields mean unknown
remote progress. Partial groups, arbitrary strings, and inconsistent state are rejected.

After the unchanged protected preflight, apply writes initial progress with
`remoteStarted: false` and four null fields. Before each operation it records the
attempted stage and sets `remoteStarted: true`; after success it records that stage
as completed. This flag proves entry into the attempt, not that a remote mutation
occurred. The sequence remains:

`link` → `migration_list_before` → `history_validation_before` →
`db_push_dry_run` → `db_push_apply` → `function_deploy` (13 commands) →
`migration_list_after` → `history_validation_after` → `deployment_complete`.

| Failed stage                | Safe error code                    |
| --------------------------- | ---------------------------------- |
| `link`                      | `SUPABASE_LINK_FAILED`             |
| `migration_list_before`     | `MIGRATION_LIST_FAILED`            |
| `history_validation_before` | `REMOTE_HISTORY_VALIDATION_FAILED` |
| `db_push_dry_run`           | `DB_PUSH_DRY_RUN_FAILED`           |
| `db_push_apply`             | `DB_PUSH_FAILED`                   |
| `function_deploy`           | `FUNCTION_DEPLOY_FAILED`           |
| `migration_list_after`      | `FINAL_MIGRATION_LIST_FAILED`      |
| `history_validation_after`  | `FINAL_HISTORY_VALIDATION_FAILED`  |

Ledger parsing is part of history validation. The parser accepts the strict
v2.109.1 JSON object shape documented in the [sanitized fixtures](../tests/fixtures/staging-commercial/README.md)
and the existing pipe-delimited table format. JSON display metadata is never
returned or published. Unknown or malformed JSON fails closed without a table
fallback; history checks are unchanged. A successful list command with unreadable output therefore fails
at history validation, before any subsequent operation.

Post-preflight failures emit `STAGING_APPLY_REMOTE_FAILED:<stage>:<code>`.
`STAGING_APPLY_LOCAL_FAILED:UNKNOWN_REMOTE_FAILURE` denotes a local setup/evidence failure before any
remote stage. A final evidence-write failure uses
`deployment_complete:UNKNOWN_REMOTE_FAILURE`. If evidence cannot be written,
the process still fails with a sanitized summary. Preflight failures continue to
use the existing preflight formatter.

Child-process spawn failures, nonzero exits, and signals fail closed. Stage,
nullable exit code, and nullable signal are available on the internal structured
error; the original error is retained privately in a WeakMap. No CLI text, command
arguments, or original exception text enters evidence or the workflow summary.
There are no retries or automatic rollback actions. The existing rollback-runbook
error and separately authorized [rollback procedure](staging-commercial-rollback.md)
remain in effect.

On failure, `deployedFunctions` includes only approved functions whose commands
returned successfully. An empty array cannot exclude effects from a failed first
deployment. A failed DB push likewise does not prove that no migration applied.
An interrupted process may leave attempted-stage evidence without a failure code;
this requires a separately authorized state audit, not an automatic retry.

Complete command execution sets both current and completed stages to
`deployment_complete` and leaves failure fields null. It still emits
`DEPLOYMENT_COMMANDS_COMPLETE_CERTIFICATION_STILL_BLOCKED`; actual staging scenarios
remain required for commercial certification.

`config/staging-commercial-evidence.template.json` is deliberately not_run. The example timestamp and base SHA identify a template, not observed staging proof. Actual records must use their observed UTC timestamp and current reviewed commit.

The strict schema in `scripts/staging-commercial-evidence.mjs` admits scenario ID, status, local_fixture/staging_test scope, UTC timestamp, commit, numeric workflow run ID, allowlisted function name, migration filename, enumerated error code, salted identifier hashes and enumerated Boolean assertions. Unknown fields and arbitrary assertion prose are rejected. All records must share the envelope commit; duplicate scenario IDs fail.

Forbidden material includes secret values, headers, JWTs, raw webhook bodies, signed Checkout/Portal URLs, customer names/emails/addresses, card/payment data, provider objects, service-role keys and DB passwords. Project/Store/subscription/customer identifiers may only be projected into typed hashes using a private per-run salt of at least 32 characters. Retain that salt only in the restricted operator workspace, not in artifacts. Sanitized equality references used for authorization are separate from published evidence hashes.

The scanner rejects suspicious text and sensitive keys recursively, including nested header objects, bearer tokens, JWTs, email addresses, all HTTP(S) URLs, and provider identifiers. The redaction utility is defense in depth, not an invitation to upload its arbitrary output. Always project into the strict evidence schema, scan and validate before writing. Constant failure codes never echo raw keys, values, Zod errors or network errors. No raw CLI/unit logs are uploaded by staging. Only generated plan files and validated deployment-evidence.json are uploaded for seven days.

The existing Playwright redactor handles credential text, ZIP traces and embedded reports, but it does not guarantee signed payment URL removal or inspect pixels/audio/video. Phase A does not treat those reports as certification artifacts. Keep browser binaries and raw captures private; manually review any separately approved visual excerpt. Never upload a browser artifact by assuming this structured scanner inspected its pixels.

`npm run staging:commercial:evidence -- <safe-input.json> <safe-output.json>` validates and emits a verdict. No argument uses the checked-in unrun template and exits 1. A pass requires green full units, all 23 scenarios passing with their scenario-specific assertions, and staging_test scope. Any missing, failed, blocked or not_run scenario blocks. With all other gates satisfied, local_fixture or not_applicable yields conditional, which never authorizes production. A green deployment command result alone cannot produce a certification pass.

Retention: delete raw temporary captures immediately after safe projection; expire sanitized artifacts after seven days unless separately approved. Preserve only aggregate sign-off as required by the owner. Do not delete commercial/provider audit history during evidence cleanup. See [rollback](staging-commercial-rollback.md) and [verification](pr-price-11-verification.md).
