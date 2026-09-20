# PADDLE-CATALOGUE-02B: trusted catalogue verifier

This server-only bridge verifies explicit private selections using the current
GET-only Sandbox transport and issues the existing instance-bound catalogue
receipts. It does not publish evidence or mappings, access a database, enable
sales/reconciliation, or compose checkout, webhook or payment authority.

## Recovered-code audit

The `catalogue-02-local-before-sync` stash was inspected and retained unchanged.
No file was restored wholesale.

| Recovered file                                              | Classification and disposition                                                                                                                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/functions/_shared/paddle-catalogue-binding.ts`    | Reused strict explicit-selection, money/cadence/quantity checks, fresh-retrieval and existing receipt-boundary concepts. Replaced stale tax enum and removed publisher/batch publication API. |
| `scripts/paddle-catalogue-binding-local.ts`                 | Reused outside-Git, bounded-file and ACL validation logic in a separate private-file reader. Discarded Docker, SQL, canonical-version discovery and automatic publication coupling.           |
| `tests/fixtures/paddle-binding-synthetic.ts`                | Test-only; adapted synthetic opaque observations and canonical fixtures, with `location` as the default.                                                                                      |
| `tests/unit/paddle-catalogue-binding.test.ts`               | Test-only; adapted applicable strict-binding, freshness and receipt-isolation scenarios. Discarded publication-runner assumptions.                                                            |
| `supabase/functions/_shared/paddle-catalogue/contract.ts`   | Discarded recovered file; authoritative merged transport contract is unchanged.                                                                                                               |
| `supabase/functions/_shared/paddle-catalogue/validation.ts` | Discarded recovered file; authoritative normalization and `location` support are unchanged.                                                                                                   |

## Private operator contract

Set `PADDLE_CATALOGUE_BINDING_PATH` to an absolute private file outside this
repository and all other Git worktrees. Suggested Windows location:
`%LOCALAPPDATA%\RepSync\paddle\catalogue-binding.json`. No user-specific path is
hardcoded. Repository-local files are rejected even when ignored; symlink
targets are resolved before checking containment. Files must be at most 64 KiB.
Windows ACLs may grant access only to the current user, SYSTEM and Administrators;
on POSIX the file must be owned by the current user without group/other access.

The closed JSON object contains exactly these fields:

- `schema`: `repsync-paddle-catalogue-binding-v1`.
- `environment`: `test`.
- `expectedCatalogue`: `canonicalVersions` (four distinct UUIDs under `launch`,
  `growth`, `scale`, `coach-seat`), `taxCategory` (`saas`), and `taxMode` (the
  explicit operator-reviewed enum).
- `selections`: exactly eight objects containing `pair`, `productRef`, `priceRef`.

Pairs are `launch.monthly`, `launch.annual`, `growth.monthly`, `growth.annual`,
`scale.monthly`, `scale.annual`, `coach-seat.monthly`, `coach-seat.annual`.
Each canonical product owns one distinct opaque product reference shared by its
two cadences; every price reference is distinct. References are never trimmed,
case-folded, interpreted by prefix, selected by name or selected by list order.
Empty, whitespace/control-containing or over-256-byte references are rejected.

Canonical version UUIDs must come from the reviewed intended destination's
canonical catalogue. They are explicit inputs because this runner has no DB
access. This preflight cannot attest that those versions are still active in a
particular database; publication's existing SQL contract independently checks
that later. No real binding, credentials or provider references are included in
source, examples, tests, snapshots or output.

## Commercial verification

The expected catalogue pins USD monthly amounts to 1900, 5900, 11900 and 1200
minor units for Launch, Growth, Scale and coach-seat respectively; annual prices
are ten times monthly. Every selected product and price must be active, with an
exact product/price association, frequency one, month/year recurrence, no trial,
no monetary overrides, minimum quantity one, maximum quantity one for plans and
five for additional seats. Tax category must match the reviewed SaaS category.

The current documented tax enums are `account_setting`, `internal`, `external`
and `location`; the observed value must also equal the explicit reviewed value.
Unknown values fail closed. See Paddle's
[price retrieval contract](https://developer.paddle.com/api-reference/prices/get-price/).
Neither the transport files nor their merged `location` handling are changed.

## Interfaces and receipts

`verifyCatalogueObservations(observations, binding, expectedCatalogue)` is an
advisory validator. It cannot mint receipts. It returns only observed counts,
canonical pass/fail results, safe tax enums, trial/override presence, receipt
count and static discrepancy codes. Missing facts stay unknown or fail; no
provider exception message, path, reference or payload is copied into output.

`createPaddleCatalogueVerifier(capability, binding, expectedCatalogue)` composes
the trusted server capability with the existing receipt boundary. `verify()`
lists products/prices, verifies selection membership, retrieves all four selected
products and all eight selected prices again, verifies the fresh observations,
then issues exactly eight receipts only if the complete batch passes. A batch
exceeding 60 seconds fails. Earlier list success never substitutes for retrieval.
Lists/retrieves are observations over time, not an atomic provider snapshot.

`withVerifiedReceipts(consumer)` is a separate trusted in-memory handoff of the
tokens and their issuing boundary. It is unavailable before success, during a
refresh, after a failed refresh, or more than 60 seconds after issuance. Receipts
remain nonserializable, instance/provider/environment bound, and unusable as
payment receipts. The callback is not a public request/JSON API. Future callers
must stay within their own authorization and reverify immediately before use.
The bridge provides no database adapter or publication function.

## Read-only runner

Run from the repository with Node supporting TypeScript transformation:

```powershell
node --experimental-transform-types scripts/paddle-catalogue-preflight.ts
```

The runner uses the existing server environment reader: `PADDLE_ENVIRONMENT`
must be `sandbox`, and `PADDLE_SANDBOX_API_KEY` must be configured privately.
Existing rejection of live/mixed credentials and custom origins remains intact.
Only the fixed Sandbox transport performs provider requests. No API key is
loaded from the binding file.

The runner prints only the sanitized summary and exits nonzero unless eight
receipts were issued. Tokens remain in runtime memory and are discarded at exit.
It cannot publish locally or remotely. Local publication proof, staging
publication and checkout remain separate tasks/callers.

## Verification

Synthetic tests cover the complete catalogue, all supported tax modes, rejected
commercial facts, strict private binding, file containment/permissions, fresh
retrieval, secret-free failures, and receipt isolation. Existing transport,
publication, proof, checkout, webhook and staging certification suites remain
applicable. Unit tests retain the repository's network-denial setup.

Real Sandbox verification requires private operator configuration and is not
claimed by synthetic test success. No real provider request or remote database
mutation is needed to validate or commit this bridge.

Final verification on `codex/paddle-catalogue-02b-verifier-bridge`, based on
merged main `50f773d`:

- 73 new verifier/private-binding/runner tests; 545 focused regression tests.
- Full unit suite: 279 files, 2,823 tests passed.
- Strict server TypeScript and application build passed.
- Local DB lint: no errors. No remote database operation performed.
- Migration manifest, repository formatting and whitespace checks passed.
- ESLint: no errors; three existing UI warnings.
- All eight changed/new files scanned: zero real provider-reference, Paddle key,
  Supabase secret, private-key or credential-bearing connection-string matches.
- Transport, receipt boundary, publication writer and migrations unchanged;
  recovered stash preserved. No real provider requests or mapping publication.

Files prepared for commit (not committed by this task):

1. `.gitignore`
2. `docs/paddle-catalogue-verifier.md`
3. `scripts/paddle-catalogue-preflight.ts`
4. `scripts/paddle-catalogue-private-binding.ts`
5. `supabase/functions/_shared/paddle-catalogue-verifier.ts`
6. `tests/fixtures/paddle-catalogue-verifier.ts`
7. `tests/unit/paddle-catalogue-verifier.test.ts`
8. `tests/unit/paddle-catalogue-preflight.test.ts`
