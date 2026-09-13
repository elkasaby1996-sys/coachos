# Public pricing catalogue v2

PR-PRICE-10 adds `get_public_commercial_catalogue_v2()` in the single forward migration `20260913010000_public_commercial_catalogue_v2.sql`. It changes only two feature readiness/visibility/label rows and adds the public RPC and its explicit grants/comment. Plan versions, mappings, prices, capacities, subscriptions, enforcement and billing operations are unchanged.

## Compatibility and privacy

The v1 function body, signature and `schemaVersion: 1` are unchanged. Its existing dynamic feature filter naturally includes newly approved features; compatibility does not mean permanently empty feature arrays. V2 adds domain fields, canonical trial policy and an add-on array. Both retain the same active public plan price/capacity projection and deterministic ordering. V2 excludes custom plans, unmapped/internal/non-saleable/retired features and blank labels.

The security-definer RPC fixes `search_path = pg_catalog, public`, uses qualified static queries and grants execution only to anon/authenticated/service_role after revoking default execution. It grants no table access and emits no private descriptions, evidence, provider identifiers or billing-account information. The private trial policy is projected into only the six public policy/capacity concepts.

## Snapshot and exact parity

Generate against the local database only:

```powershell
node scripts/public-catalogue-snapshot.mjs --write
npx prettier --write src/features/commercial-catalogue/public-catalogue-v2.generated.ts
node scripts/public-catalogue-snapshot.mjs
```

The generator executes the RPC as `anon` inside the fixed `supabase_db_coachos` container. It does not accept a project URL or remote connection. Review the generated TypeScript literal before committing it. The check transpiles that same literal and uses exact deep equality against the anonymous RPC. Missing/extra features, labels, numeric values, array ordering, trial values and add-ons all fail equality. There is no independently authored public feature array.

`public-catalogue-snapshot.ts` strictly parses and recursively freezes the generated literal. Zod rejects unknown fields/keys, domain mismatches, duplicate features, noninteger amounts, locked contract changes, trial drift and all currently unapproved add-ons. The retained lightweight v1 price projection also protects existing Billing consumers; public pricing uses v2. Auth/root providers do not import the new snapshot. No runtime catalogue request is needed to render public pricing.

The Playwright catalogue contract compares the real local RPC with the imported, parsed TypeScript snapshot. The CLI separately proves anonymous execution. pgTAP proves anonymous/authenticated permissions, filtering, privacy and trial/plan compatibility. Unit tests exercise drift dimensions, strict validation, freezing, grouping and rendered inclusion semantics.

## Public presentation

Cards remain Launch/Growth/Scale, with Growth most popular. Prices are USD $19/$59/$119 monthly and $190/$590/$1,190 for a full year. Annual savings equal two monthly payments. Cards distinguish included seats from total seat ceilings, show all five capacities and derive short highlights from approved feature labels.

The comparison uses the same snapshot, with capacity rows and nonempty domain groups. Inclusion is written as “Included” or “Not included”; meaning does not depend on color or icons. At 375px the labelled keyboard-focusable table region scrolls horizontally without page overflow. Existing visual styling, navigation and trial CTAs are retained.

The trial is 14 calendar days, no card, Growth experience, 10 clients, 2 coach seats, 1 workspace and 3 published packages. Selected Launch/Growth/Scale intent stays separate from that trial. No automatic conversion or invitation charge is implied.

## Add-on publication and rollback

Additional seats remain hidden: no real provider purchase, invoice, renewal or webhook proof exists. Active private billing mappings cannot publish an add-on. The current RPC always returns `addons: []`, and the schema rejects a nonempty list. A future reviewed publication must update the RPC and validation gate together and regenerate/review the snapshot. The existing conditional renderer already supports unit price, cadence, each plan's maximum/included seats, explicit owner purchase, no automatic invitation charge and provider taxes/proration.

Before deployment, rollback is an application revert and clean local reset. If separately deployed later, use a compensating migration to restore client management to IMPLEMENTED/internal and lifecycle management to DRAFT/internal with null labels, and remove the v2 entry point only after consumers have reverted. Preserve v1, keys, mappings and all subscription/provider/domain history. This PR performs no deployment or remote operation.

See [PR-PRICE-11 staging certification preparation](staging-commercial-certification.md) for the separately authorized staging plan/apply boundary.
