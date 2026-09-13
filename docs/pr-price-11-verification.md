# PR-PRICE-11 Phase A verification

Local preparation implementation; broader verification is recorded below. Real staging certification remains blocked. No remote Supabase operation, Lemon Squeezy API request, deployment, secret update, webhook registration, provider mapping insertion or purchase is permitted by this task.

Base: `7692f4fbc8a47a3f5a9e04a5328c3d716511ffc7`. Branch: `feat/pr-price-11-staging-commercial-certification`. The base was fetched from origin/main and contains PR-PRICE-10, -09 and -08. Initial worktree was clean.

The staging audit, unit-gate decision and execution boundary are documented in [certification](staging-commercial-certification.md). The full suite must be restored before apply; retaining an exact inherited-failure set is regression evidence only, never an exemption.

## Changed files

| File                                                  | Purpose                                                                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/supabase-deploy-staging.yml`       | Default local plan; protected main-only apply; one setup; sanitized uploads; full-unit blocker.                                        |
| `.gitignore`                                          | Keep local plans, private logs and transient verification output out of source.                                                        |
| `package.json`                                        | Six staging commercial commands.                                                                                                       |
| `supabase/config.toml`                                | Explicit true JWT contract for Open Wearables; no auth or migration change.                                                            |
| `scripts/supabase-remote-guard.mjs`                   | Exact project validation, linked-project check, valid DB flags, environment-only passwords, installed CLI without shell.               |
| `scripts/staging-commercial-contracts.mjs`            | Strict manifest/scenario/rollback schemas; source, target, migration and JWT checks.                                                   |
| `scripts/staging-commercial-plan.mjs`                 | Network-free Git/filesystem validation, safe JSON/Markdown command plan and authorization request.                                     |
| `scripts/staging-commercial-apply.mjs`                | Separately authorized future apply, strict preflight, full-unit blocker, migration drift checks and safe evidence. Never invoked here. |
| `scripts/staging-commercial-catalogue.mjs`            | Exact local anonymous parity and future explicit HTTPS staging read boundary.                                                          |
| `scripts/staging-commercial-provider.mjs`             | Normalized fake/hashed test mappings and graduated seat validation with no transport.                                                  |
| `scripts/staging-commercial-evidence.mjs`             | Strict evidence, redaction utility/scanner and blocked/conditional/pass verdicts.                                                      |
| `config/staging-commercial-certification.json`        | Frozen migration hashes, function allowlists, names and policy.                                                                        |
| `config/staging-commercial-provider.fake.json`        | Six synthetic plan/cadence graduated contracts.                                                                                        |
| `config/staging-commercial-scenarios.json`            | All 23 detailed scenarios, initially not_run.                                                                                          |
| `config/staging-commercial-evidence.template.json`    | Unrun sanitized evidence template.                                                                                                     |
| `config/staging-commercial-rollback.json`             | Ten complete history-preserving rollback/cleanup templates.                                                                            |
| `docs/evidence/pr-price-11-unit-comparison.json`      | Exact baseline/final failing file and full-test identities, without raw assertion payloads.                                            |
| `tests/unit/staging-commercial-certification.test.ts` | Local negative/positive contracts, YAML inspection, fake transport and guard argument tests.                                           |
| `docs/staging-commercial-certification.md`            | Phase boundary, workflow audit, scenario matrix and operator runbook.                                                                  |
| `docs/staging-commercial-deployment-manifest.md`      | Schema, migration drift, secret ownership, provider adapter and parity contracts.                                                      |
| `docs/staging-commercial-evidence.md`                 | Evidence privacy, retention, browser limitations and verdict rules.                                                                    |
| `docs/staging-commercial-rollback.md`                 | Rollback and cleanup procedures.                                                                                                       |
| `docs/pr-price-11-verification.md`                    | This verification record.                                                                                                              |

## Results

Initial local results: strict bundle validation passed; 71 harness tests passed; all eleven Deno checks passed; local start/reset/lint and 15 SQL files with 1,036 assertions passed; exact local anonymous catalogue parity passed. Lint passed with the same three inherited warnings; formatting and build passed. Full units: 1,855 total, 1,842 passing, the exact same 13 failures as baseline, no skipped tests. The first targeted Billing/catalogue browser run had 23 passes and 17 failures (mostly locator timeouts and one portal route already handled error); it overlapped with build work, but causation has not been established. These failures are not waived. Final release runs follow below. See [exact unit comparison](evidence/pr-price-11-unit-comparison.json). The full authorization request is generated from the final clean local commit into the ignored plan output directory so it does not falsely bind a working-tree edit to the base commit. Review of that commit and named Phase B resources is still required.
