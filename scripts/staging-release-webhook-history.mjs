// Read-only release evidence. This module has no provider, database writer or
// status-transition capability. Private rows never leave the classifier.
import { z } from "zod";
import { ensure } from "./staging-release-artifacts.mjs";
import { hash } from "./billing-retirement-release.mjs";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const historyReviewSchema = z.strictObject({
  schemaVersion: z.literal(1),
  evidenceSha256: digest,
  records: z.array(
    z.strictObject({
      eventSha256: digest,
      inputsSha256: digest,
      classification: z.enum([
        "SYNTHETIC_TEST_HISTORY",
        "HISTORICAL_COMPLETED_OR_SUPERSEDED",
      ]),
      provenance: z.discriminatedUnion("kind", [
        z.strictObject({ kind: z.literal("closed_fixture") }),
        z.strictObject({ kind: z.literal("applied_purchase") }),
        z.strictObject({
          kind: z.literal("archived_synthetic"),
          sourceArtifactSha256: digest,
          reconstructionArtifactSha256: digest,
          reconstructedPayloadSha256: z.array(digest).min(1),
        }),
      ]),
    }),
  ),
});
export function evidenceCanonical(value) {
  if (value === null || ["string", "boolean"].includes(typeof value))
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value))
    return "[" + value.map(evidenceCanonical).join(",") + "]";
  ensure(
    value && typeof value === "object",
    "RELEASE_WEBHOOK_EVIDENCE_INVALID",
  );
  return (
    "{" +
    Object.keys(value)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + evidenceCanonical(value[k]))
      .join(",") +
    "}"
  );
}
export const evidenceDigest = (value) => hash(evidenceCanonical(value));
const INGESTION = [
  "billing_webhook_events_v2",
  "billing_paddle_event_observations",
  "billing_paddle_event_deliveries",
  "billing_verified_evidence_v2",
];
// These effects refer to the billing account, not the provider subscription.
// Historical rows remain evidence; only a proven ended lifecycle clears authority.
const FIXTURE_ACCOUNT_AUTHORITY_TABLES = [
  "account_feature_entitlement_overrides",
  "account_capacity_reservations",
];
export const WEBHOOK_HISTORY_TABLES = [
  ...INGESTION,
  "billing_checkouts_v2",
  "billing_paddle_checkout_certification_fixtures",
  "billing_customers_v2",
  "billing_subscriptions_v2",
  "billing_evidence_v2",
  "billing_payment_applications_v2",
  "billing_operations_v2",
  "billing_canonical_origins",
  "account_subscriptions",
  ...FIXTURE_ACCOUNT_AUTHORITY_TABLES,
];
const terminal = ["processed", "ignored"];
const closedOperation = ["completed", "canceled", "failed", "scheduled"];
const ref = (value) => typeof value === "string" && value.length > 0;
const authorityIdentity = (value) => ref(value) && value.trim() === value;
// Resolve effective boundaries in PostgreSQL, never through millisecond Date
// parsing. The derived state is stable until a lifecycle boundary changes and is
// included in the same SELECT/digest as the complete, unmodified historical row.
function authorityLifecycleSQL(table) {
  if (table === "account_feature_entitlement_overrides")
    return `case when isfinite(t.created_at) and t.created_at<=transaction_timestamp()
      and isfinite(t.starts_at)
      and (t.expires_at is null or (isfinite(t.expires_at) and t.expires_at>t.starts_at))
      and (t.revoked_at is null or (isfinite(t.revoked_at) and t.revoked_at>=t.created_at and t.revoked_at<=transaction_timestamp()))
      then case when t.revoked_at is not null then 'revoked'
        when t.expires_at<=transaction_timestamp() then 'expired' else 'blocking' end
      else 'blocking' end`;
  if (table === "account_capacity_reservations")
    return `case when isfinite(t.created_at) and t.created_at<=transaction_timestamp()
      and isfinite(t.expires_at) and t.expires_at>t.created_at
      and isfinite(t.updated_at) and t.updated_at>=t.created_at and t.updated_at<=transaction_timestamp()
      and t.consumed_at is null
      then case
        when t.status='released' and t.expired_at is null and isfinite(t.released_at)
          and t.released_at>=t.created_at and t.released_at<=transaction_timestamp()
          then 'released'
        when t.status='expired' and t.released_at is null and isfinite(t.expired_at)
          and t.expired_at>=t.expires_at and t.expired_at<=transaction_timestamp()
          then 'expired'
        else 'blocking' end
      else 'blocking' end`;
  return null;
}
const present = (row, keys) => keys.every((key) => Object.hasOwn(row, key));
// Validate relative ordering without losing PostgreSQL's six fractional digits.
// Effective-now decisions still come exclusively from the database snapshot.
function timestampMicros(value) {
  const m =
    typeof value === "string" &&
    value.match(
      /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/,
    );
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  if (
    year === 0 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    Number(m[10] ?? 0) > 15 ||
    Number(m[11] ?? 0) > 59
  )
    return null;
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(hour, minute, second, 0);
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  )
    return null;
  const offset =
    (Number(m[10] ?? 0) * 60 + Number(m[11] ?? 0)) * (m[9] === "-" ? -1 : 1);
  return (
    BigInt(d.getTime() - offset * 60_000) * 1000n +
    BigInt((m[7] ?? "").padEnd(6, "0"))
  );
}
const timestampText = (value) => timestampMicros(value) !== null;
export function isEffectiveEntitlementAuthority(row) {
  if (
    !present(row, ["starts_at", "expires_at", "revoked_at", "created_at"]) ||
    !authorityIdentity(row.id) ||
    !authorityIdentity(row.billing_account_id) ||
    !ref(row.feature_key) ||
    !["enable", "disable"].includes(row.effect) ||
    !timestampText(row.created_at) ||
    !timestampText(row.starts_at) ||
    (row.expires_at !== null && !timestampText(row.expires_at)) ||
    (row.revoked_at !== null && !timestampText(row.revoked_at)) ||
    (row.expires_at !== null &&
      timestampMicros(row.expires_at) <= timestampMicros(row.starts_at)) ||
    (row.revoked_at !== null &&
      timestampMicros(row.revoked_at) < timestampMicros(row.created_at)) ||
    Object.hasOwn(row, "status")
  )
    return true;
  return !(
    (row.__release_authority_lifecycle === "revoked" &&
      row.revoked_at !== null) ||
    (row.__release_authority_lifecycle === "expired" &&
      row.revoked_at === null &&
      row.expires_at !== null)
  );
}
export function isEffectiveCapacityAuthority(row) {
  if (
    !present(row, [
      "created_at",
      "updated_at",
      "expires_at",
      "consumed_at",
      "released_at",
      "expired_at",
    ]) ||
    !authorityIdentity(row.id) ||
    !authorityIdentity(row.billing_account_id) ||
    ![
      "counted_clients",
      "coach_seats",
      "active_workspaces",
      "published_packages",
    ].includes(row.dimension) ||
    !Number.isSafeInteger(row.quantity) ||
    row.quantity <= 0 ||
    !timestampText(row.created_at) ||
    !timestampText(row.updated_at) ||
    !timestampText(row.expires_at) ||
    row.consumed_at !== null ||
    timestampMicros(row.expires_at) <= timestampMicros(row.created_at) ||
    timestampMicros(row.updated_at) < timestampMicros(row.created_at)
  )
    return true;
  return !(
    (row.status === "released" &&
      row.__release_authority_lifecycle === "released" &&
      row.expired_at === null &&
      timestampText(row.released_at) &&
      timestampMicros(row.released_at) >= timestampMicros(row.created_at) &&
      timestampMicros(row.released_at) <= timestampMicros(row.updated_at)) ||
    (row.status === "expired" &&
      row.__release_authority_lifecycle === "expired" &&
      row.released_at === null &&
      timestampText(row.expired_at) &&
      timestampMicros(row.expired_at) >= timestampMicros(row.expires_at) &&
      timestampMicros(row.expired_at) <= timestampMicros(row.updated_at))
  );
}
function strings(value) {
  if (typeof value === "string") {
    // Audit JSON can be retained as text rather than jsonb.
    try {
      const decoded = JSON.parse(value);
      if (decoded && typeof decoded === "object") return strings(decoded);
    } catch {
      /* ordinary identifier */
    }
    return [value];
  }
  if (Array.isArray(value)) return value.flatMap(strings);
  return value && typeof value === "object"
    ? Object.values(value).flatMap(strings)
    : [];
}
function touches(row, references) {
  return strings(row).some((s) => references.has(s));
}
function sortedRows(rows) {
  return [...rows].sort((a, b) => {
    const x = evidenceCanonical(a),
      y = evidenceCanonical(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}
function resolvedCanonical(tables, initial, account) {
  let row = initial;
  const visited = new Set();
  while (row) {
    if (
      visited.has(row.id) ||
      row.billing_account_id !== account ||
      row.subscription_kind !== "paid" ||
      row.source !== "billing_provider"
    )
      return false;
    visited.add(row.id);
    if (
      !tables.billing_canonical_origins.some(
        (o) =>
          o.account_subscription_id === row.id &&
          o.billing_account_id === account &&
          o.storage_contract === "billing.v2",
      )
    )
      return false;
    if (["active", "expired"].includes(row.status)) return true;
    if (
      row.status !== "superseded" ||
      !Number.isFinite(Date.parse(row.superseded_at)) ||
      !ref(row.superseded_by_subscription_id)
    )
      return false;
    const next = tables.account_subscriptions.filter(
      (s) => s.id === row.superseded_by_subscription_id,
    );
    if (next.length !== 1) return false;
    row = next[0];
  }
  return false;
}
export function validateHistoryReview(raw) {
  const parsed = historyReviewSchema.safeParse(raw);
  ensure(parsed.success, "RELEASE_WEBHOOK_REVIEW_INVALID");
  const review = parsed.data;
  ensure(
    new Set(review.records.map((r) => r.eventSha256)).size ===
      review.records.length,
    "RELEASE_WEBHOOK_REVIEW_DUPLICATE",
  );
  return review;
}
// One SELECT snapshot of every public relation already bound by the release
// schema/history contract. Only private memory receives rows; reports emit hashes.
// This also discovers linkage in audit/entitlement/capacity or unanticipated tables.
export function webhookHistoryQuery(tables) {
  ensure(
    Array.isArray(tables) &&
      tables.length > 0 &&
      new Set(tables).size === tables.length &&
      tables.every((t) => /^[a-z_][a-z0-9_]*$/.test(t)),
    "RELEASE_WEBHOOK_TABLE_INVALID",
  );
  ensure(
    WEBHOOK_HISTORY_TABLES.every((t) => tables.includes(t)),
    "RELEASE_WEBHOOK_TABLE_MISSING",
  );
  return (
    "select jsonb_object_agg(name,rows) webhook_history from (" +
    [...tables]
      .sort()
      .map((t) => {
        const lifecycle = authorityLifecycleSQL(t);
        const content =
          t === "billing_paddle_event_observations"
            ? "observation"
            : ["billing_verified_evidence_v2", "billing_evidence_v2"].includes(
                  t,
                )
              ? "proof"
              : null;
        // Bind PostgreSQL's exact bytes too: JSON number decoding in Node must
        // never erase a change to a bigint/high-precision numeric column.
        const row =
          `to_jsonb(t)||jsonb_build_object('__release_row_sha256',encode(extensions.digest(to_jsonb(t)::text,'sha256'),'hex'))` +
          (content
            ? `||jsonb_build_object('__release_content_sha256',encode(extensions.digest(t.${content}::text,'sha256'),'hex'))`
            : "") +
          (lifecycle
            ? `||jsonb_build_object('__release_authority_lifecycle',${lifecycle})`
            : "");
        return `select '${t}' name,coalesce(jsonb_agg(${row} order by to_jsonb(t)::text),'[]'::jsonb) rows from public."${t}" t`;
      })
      .join(" union all ") +
    ") release_webhook_snapshot"
  );
}
export function inspectWebhookHistory(tables) {
  ensure(
    tables &&
      WEBHOOK_HISTORY_TABLES.every((t) => Array.isArray(tables[t])) &&
      Object.values(tables).every(Array.isArray),
    "RELEASE_WEBHOOK_SNAPSHOT_INVALID",
  );
  ensure(
    FIXTURE_ACCOUNT_AUTHORITY_TABLES.every((table) =>
      tables[table].every(
        (row) => row && authorityIdentity(row.billing_account_id),
      ),
    ),
    "RELEASE_WEBHOOK_ACCOUNT_AUTHORITY_INVALID",
  );
  tables = Object.fromEntries(
    Object.entries(tables).map(([t, rows]) => [t, sortedRows(rows)]),
  );
  const events = tables.billing_webhook_events_v2;
  ensure(
    new Set(events.map((e) => e.id)).size === events.length &&
      events.every((e) => ref(e.id)),
    "RELEASE_WEBHOOK_SNAPSHOT_INVALID",
  );
  const allRowsSha256 = evidenceDigest(
    Object.fromEntries(
      Object.keys(tables)
        .filter((t) => tables[t].length > 0)
        .sort()
        .map((t) => [t, sortedRows(tables[t])]),
    ),
  );
  return events
    .filter((e) => !terminal.includes(e.processing_status))
    .map((event) => {
      const observations = tables.billing_paddle_event_observations.filter(
        (o) => o.event_id === event.id,
      );
      const deliveries = tables.billing_paddle_event_deliveries.filter(
        (d) => d.event_id === event.id,
      );
      const receipts = tables.billing_verified_evidence_v2.filter(
        (v) =>
          deliveries.some((d) => d.verified_evidence_id === v.id) ||
          v.provider_event_ref === event.provider_event_ref,
      );
      const observation = observations.length === 1 ? observations[0] : null;
      const o = observation?.observation;
      const references = new Set(
        [
          event.id,
          event.provider_event_ref,
          event.resource_ref,
          event.subscription_ref,
          event.customer_ref,
          o?.subscriptionRef,
          o?.customerRef,
          o?.transactionRef,
          o?.transactionCorrelationRef,
          ...receipts.map((v) => v.id),
        ].filter(ref),
      );
      const tx = o?.transactionRef ?? o?.transactionCorrelationRef;
      const checkout = tables.billing_checkouts_v2.filter(
        (c) =>
          c.id === observation?.checkout_id ||
          (ref(tx) &&
            c.provider === event.provider &&
            c.environment === event.environment &&
            c.provider_transaction_ref === tx),
      );
      const subscriptions = tables.billing_subscriptions_v2.filter(
        (s) =>
          s.provider === event.provider &&
          s.environment === event.environment &&
          s.provider_subscription_ref === o?.subscriptionRef,
      );
      const customer = tables.billing_customers_v2.filter(
        (c) =>
          c.provider === event.provider &&
          c.environment === event.environment &&
          c.provider_customer_ref === o?.customerRef,
      );
      const payments = tables.billing_payment_applications_v2.filter(
        (p) =>
          (ref(tx) &&
            p.provider_transaction_ref === tx &&
            p.provider === event.provider &&
            p.environment === event.environment) ||
          checkout.some((c) => c.id === p.checkout_id),
      );
      for (const r of [...checkout, ...subscriptions, ...customer])
        references.add(r.id);
      const related = Object.fromEntries(
        Object.entries(tables).map(([t, rows]) => [
          t,
          sortedRows(rows.filter((r) => touches(r, references))),
        ]),
      );
      const owners = new Set(
        [
          ...subscriptions.map((s) => s.billing_account_id),
          ...customer.map((c) => c.billing_account_id),
          ...checkout.map((c) => c.billing_account_id),
        ].filter(ref),
      );
      const operations = tables.billing_operations_v2.filter(
        (p) => owners.has(p.billing_account_id) || touches(p, references),
      );
      const consistent =
        ["received", "deferred", "failed", "manual_review"].includes(
          event.processing_status,
        ) &&
        [
          "transaction.completed",
          "subscription.created",
          "subscription.updated",
        ].includes(event.provider_event_name) &&
        event.resource_ref ===
          (event.provider_event_name === "transaction.completed"
            ? o?.transactionRef
            : o?.subscriptionRef) &&
        event.provider === "paddle" &&
        event.environment === "test" &&
        observations.length === 1 &&
        digest.safeParse(event.first_payload_sha256).success &&
        o?.eventRef === event.provider_event_ref &&
        o?.eventType === event.provider_event_name &&
        o?.kind === event.provider_event_name &&
        o?.provider === event.provider &&
        o?.environment === event.environment &&
        o?.subscriptionRef === event.subscription_ref &&
        o?.customerRef === event.customer_ref &&
        observation.observation_sha256 ===
          observation.__release_content_sha256 &&
        digest.safeParse(observation.observation_sha256).success &&
        deliveries.length > 0 &&
        new Set(deliveries.map((d) => d.notification_ref)).size ===
          deliveries.length &&
        deliveries.some(
          (d) => d.raw_payload_sha256 === event.first_payload_sha256,
        ) &&
        receipts.length === deliveries.length &&
        deliveries.every((d) => {
          const v = receipts.find((v) => v.id === d.verified_evidence_id);
          return (
            digest.safeParse(d.raw_payload_sha256).success &&
            v?.proof_kind === "event" &&
            v.source_kind === "webhook" &&
            v.payment_authority === false &&
            v.normalized_sha256 === v.__release_content_sha256 &&
            digest.safeParse(v.normalized_sha256).success &&
            v.provider === event.provider &&
            v.environment === event.environment &&
            v.provider_event_ref === event.provider_event_ref &&
            v.provider_notification_ref === d.notification_ref &&
            v.raw_payload_sha256 === d.raw_payload_sha256 &&
            v.proof?.identity?.subscriptionRef === o.subscriptionRef &&
            v.proof?.identity?.customerRef === o.customerRef &&
            v.proof?.eventEvidence?.eventRef === o.eventRef &&
            v.proof?.eventEvidence?.eventName === event.provider_event_name &&
            v.proof?.eventEvidence?.resourceRef === event.resource_ref &&
            v.proof?.eventEvidence?.resourceType === event.resource_type &&
            ((v.subscription_id === null && v.billing_account_id === null) ||
              (subscriptions.length === 1 &&
                customer.length === 1 &&
                v.subscription_id === subscriptions[0].id &&
                v.billing_account_id === subscriptions[0].billing_account_id &&
                v.billing_account_id === customer[0].billing_account_id))
          );
        });
      const peers = tables.billing_paddle_event_observations.filter(
        (p) =>
          p.observation?.provider === event.provider &&
          p.observation?.environment === event.environment &&
          ref(o?.subscriptionRef) &&
          p.observation?.subscriptionRef === o.subscriptionRef &&
          p.observation?.customerRef === o.customerRef,
      );
      const fixtureCheckouts = tables.billing_checkouts_v2.filter(
        (c) =>
          peers.some((p) => p.checkout_id === c.id) ||
          checkout.some((p) => p.id === c.id),
      );
      const fixtures =
        tables.billing_paddle_checkout_certification_fixtures.filter((f) =>
          fixtureCheckouts.some((c) => c.id === f.checkout_id),
        );
      const noOpenWork =
        checkout.every((c) =>
          ["completed", "expired", "failed"].includes(c.status),
        ) && operations.every((p) => closedOperation.includes(p.status));
      const noSyntheticEffect =
        payments.length === 0 &&
        subscriptions.every(
          (s) =>
            s.account_subscription_id === null &&
            s.approved_additional_coach_seats === 0,
        ) &&
        related.billing_evidence_v2.length === 0 &&
        related.billing_provider_identity_transitions_v2?.every(
          (t) => t.triggering_event_id !== event.id,
        ) !== false;
      // An archived unknown-resource event must have no authority linkage ANYWHERE
      // outside ingestion. Closed-fixture rows may own a retired shadow, never a
      // canonical/payment effect. Other related tables need explicit review below.
      const archiveNoAuthority =
        Object.entries(related).every(
          ([t, rows]) => INGESTION.includes(t) || rows.length === 0,
        ) &&
        checkout.length === 0 &&
        subscriptions.length === 0 &&
        customer.length === 0 &&
        receipts.every(
          (v) =>
            v.subscription_id === null &&
            v.billing_account_id === null &&
            v.commercial_effect_key === null,
        );
      const fixtureAllowed = [
        ...INGESTION,
        "billing_checkouts_v2",
        "billing_paddle_checkout_snapshots",
        "billing_paddle_checkout_certification_fixtures",
        "billing_subscriptions_v2",
        "billing_customers_v2",
        "billing_provider_identity_transitions_v2",
      ];
      const fixtureNoUnknownEffect = Object.entries(related).every(
        ([t, rows]) =>
          fixtureAllowed.includes(t) ||
          rows.length === 0 ||
          (t === "account_feature_entitlement_overrides" &&
            rows.every((row) => !isEffectiveEntitlementAuthority(row))) ||
          (t === "account_capacity_reservations" &&
            rows.every((row) => !isEffectiveCapacityAuthority(row))),
      );
      // subscription.updated can reach the fixture checkout only through a peer
      // observation. Include that checkout's owner rather than relying solely on
      // direct provider references or on the presence of a retained shadow.
      const fixtureOwners = new Set([
        ...owners,
        ...fixtureCheckouts.map((c) => c.billing_account_id),
      ]);
      const fixtureNoAccountAuthority =
        fixtureOwners.size === 1 &&
        [...fixtureOwners].every(ref) &&
        FIXTURE_ACCOUNT_AUTHORITY_TABLES.every((table) =>
          tables[table].every(
            (row) =>
              !fixtureOwners.has(row.billing_account_id) ||
              !(table === "account_feature_entitlement_overrides"
                ? isEffectiveEntitlementAuthority(row)
                : isEffectiveCapacityAuthority(row)),
          ),
        );
      const closedFixture =
        fixtures.length === 1 &&
        fixtureCheckouts.length === 1 &&
        ref(fixtures[0].closed_at) &&
        Number.isFinite(Date.parse(fixtures[0].closed_at)) &&
        fixtureCheckouts[0].status === "expired" &&
        fixtureCheckouts[0].provider === event.provider &&
        fixtureCheckouts[0].environment === event.environment &&
        noSyntheticEffect &&
        fixtureNoUnknownEffect &&
        fixtureNoAccountAuthority;
      const payment = payments.length === 1 ? payments[0] : null;
      const sub = subscriptions.length === 1 ? subscriptions[0] : null;
      const canonical = tables.account_subscriptions.filter(
        (c) => c.id === sub?.account_subscription_id,
      );
      const origins = tables.billing_canonical_origins.filter(
        (c) => c.account_subscription_id === sub?.account_subscription_id,
      );
      const applicationEvidence = tables.billing_evidence_v2.filter(
        (e) => e.id === payment?.evidence_id,
      );
      const purchaseFacts = applicationEvidence[0]?.proof?.observation;
      const purchaseSourceComplete = ["transaction", "subscription"].every(
        (kind) => {
          const source = tables.billing_webhook_events_v2.filter(
            (e) => e.id === purchaseFacts?.[`${kind}EventId`],
          );
          const sourceObservations =
            tables.billing_paddle_event_observations.filter(
              (o) => o.event_id === source[0]?.id,
            );
          const receipt = tables.billing_verified_evidence_v2.filter(
            (v) => v.id === purchaseFacts?.[`${kind}VerifiedEvidenceId`],
          );
          return (
            source.length === 1 &&
            sourceObservations.length === 1 &&
            receipt.length === 1 &&
            source[0].provider === event.provider &&
            source[0].environment === event.environment &&
            source[0].provider_event_name ===
              (kind === "transaction"
                ? "transaction.completed"
                : "subscription.created") &&
            source[0].subscription_ref === o?.subscriptionRef &&
            source[0].customer_ref === o?.customerRef &&
            digest.safeParse(source[0].first_payload_sha256).success &&
            sourceObservations[0].checkout_id === checkout[0]?.id &&
            sourceObservations[0].observation?.provider === event.provider &&
            sourceObservations[0].observation?.environment ===
              event.environment &&
            sourceObservations[0].observation?.eventRef ===
              source[0].provider_event_ref &&
            sourceObservations[0].observation?.eventType ===
              source[0].provider_event_name &&
            sourceObservations[0].observation?.kind ===
              source[0].provider_event_name &&
            sourceObservations[0].observation?.subscriptionRef ===
              o?.subscriptionRef &&
            sourceObservations[0].observation?.customerRef === o?.customerRef &&
            source[0].resource_ref ===
              (kind === "transaction" ? tx : o?.subscriptionRef) &&
            sourceObservations[0].observation_sha256 ===
              purchaseFacts[`${kind}ObservationSha256`] &&
            digest.safeParse(sourceObservations[0].observation_sha256)
              .success &&
            sourceObservations[0].observation_sha256 ===
              sourceObservations[0].__release_content_sha256 &&
            receipt[0].provider === event.provider &&
            receipt[0].environment === event.environment &&
            receipt[0].proof_kind === "event" &&
            receipt[0].source_kind === "webhook" &&
            receipt[0].payment_authority === false &&
            receipt[0].provider_event_ref === source[0].provider_event_ref &&
            receipt[0].proof?.identity?.subscriptionRef ===
              o?.subscriptionRef &&
            receipt[0].proof?.identity?.customerRef === o?.customerRef &&
            receipt[0].proof?.eventEvidence?.eventRef ===
              source[0].provider_event_ref &&
            receipt[0].proof?.eventEvidence?.eventName ===
              source[0].provider_event_name &&
            receipt[0].proof?.eventEvidence?.resourceRef ===
              source[0].resource_ref &&
            receipt[0].proof?.eventEvidence?.resourceType ===
              source[0].resource_type &&
            digest.safeParse(receipt[0].normalized_sha256).success &&
            receipt[0].normalized_sha256 ===
              receipt[0].__release_content_sha256 &&
            tables.billing_paddle_event_deliveries.some(
              (d) =>
                d.event_id === source[0].id &&
                d.verified_evidence_id === receipt[0].id &&
                d.notification_ref === receipt[0].provider_notification_ref &&
                d.raw_payload_sha256 === receipt[0].raw_payload_sha256,
            ) &&
            tables.billing_paddle_event_deliveries.some(
              (d) =>
                d.event_id === source[0].id &&
                d.raw_payload_sha256 === source[0].first_payload_sha256,
            )
          );
        },
      );
      const applied =
        purchaseSourceComplete &&
        payment &&
        sub &&
        customer.length === 1 &&
        checkout.length === 1 &&
        checkout[0].status === "completed" &&
        Number.isFinite(Date.parse(checkout[0].completed_at)) &&
        checkout[0].completed_subscription_id === sub.id &&
        payment.application_kind === "initial_purchase" &&
        Number.isFinite(Date.parse(payment.applied_at)) &&
        payment.subscription_id === sub.id &&
        payment.checkout_id === checkout[0].id &&
        payment.operation_id === null &&
        payment.provider_transaction_ref === tx &&
        payment.provider === event.provider &&
        payment.environment === event.environment &&
        payment.billing_account_id === sub.billing_account_id &&
        checkout[0].billing_account_id === sub.billing_account_id &&
        customer[0].billing_account_id === sub.billing_account_id &&
        sub.customer_id === customer[0].id &&
        sub.reconciliation_status === "processed" &&
        owners.size === 1 &&
        canonical.length === 1 &&
        canonical[0].billing_account_id === sub.billing_account_id &&
        canonical[0].subscription_kind === "paid" &&
        canonical[0].source === "billing_provider" &&
        ["active", "expired", "superseded"].includes(canonical[0].status) &&
        resolvedCanonical(tables, canonical[0], sub.billing_account_id) &&
        origins.length === 1 &&
        origins[0].storage_contract === "billing.v2" &&
        origins[0].billing_account_id === sub.billing_account_id &&
        applicationEvidence.length === 1 &&
        applicationEvidence[0].provider_transaction_ref === tx &&
        applicationEvidence[0].subscription_id === sub.id &&
        applicationEvidence[0].provider === event.provider &&
        applicationEvidence[0].environment === event.environment &&
        applicationEvidence[0].proof_kind === "transaction" &&
        applicationEvidence[0].proof_schema === "paddle-initial-purchase-v1" &&
        digest.safeParse(applicationEvidence[0].normalized_sha256).success &&
        applicationEvidence[0].normalized_sha256 ===
          applicationEvidence[0].__release_content_sha256 &&
        applicationEvidence[0].proof?.identity?.transactionRef === tx &&
        applicationEvidence[0].proof?.observation?.checkoutId ===
          checkout[0].id &&
        applicationEvidence[0].proof?.observation?.subscriptionId === sub.id &&
        applicationEvidence[0].proof?.observation?.billingAccountId ===
          sub.billing_account_id &&
        applicationEvidence[0].proof?.observation?.[
          event.provider_event_name === "transaction.completed"
            ? "transactionEventId"
            : "subscriptionEventId"
        ] === event.id;
      return {
        eventSha256: evidenceDigest({
          id: event.id,
          provider: event.provider,
          environment: event.environment,
        }),
        inputsSha256: evidenceDigest({
          event,
          observations: sortedRows(observations),
          deliveries: sortedRows(deliveries),
          receipts: sortedRows(receipts),
          related: Object.fromEntries(
            Object.entries(related).filter(([, rows]) => rows.length > 0),
          ),
          fixtureCheckouts,
          fixtures,
          payments,
          subscriptions,
          customer,
          operations,
          canonical,
          origins,
          applicationEvidence,
          allRowsSha256,
        }),
        payloadSha256: deliveries.map((d) => d.raw_payload_sha256).sort(),
        consistent,
        noOpenWork,
        archiveNoAuthority,
        closedFixture: Boolean(closedFixture),
        applied: Boolean(applied),
      };
    })
    .sort((a, b) => a.eventSha256.localeCompare(b.eventSha256));
}
export function classifyWebhookHistory(tables, rawReview) {
  const review = validateHistoryReview(rawReview);
  const inputs = inspectWebhookHistory(tables);
  const records = inputs.map((input) => {
    const approved = review.records.find(
      (r) => r.eventSha256 === input.eventSha256,
    );
    let classification = "ACTIVE_BLOCKING",
      reason = "UNREVIEWED_OR_CHANGED";
    if (
      approved?.inputsSha256 === input.inputsSha256 &&
      input.consistent &&
      input.noOpenWork
    ) {
      const p = approved.provenance;
      if (
        approved.classification === "SYNTHETIC_TEST_HISTORY" &&
        ((p.kind === "closed_fixture" && input.closedFixture) ||
          (p.kind === "archived_synthetic" &&
            input.archiveNoAuthority &&
            evidenceCanonical([...p.reconstructedPayloadSha256].sort()) ===
              evidenceCanonical(input.payloadSha256)))
      ) {
        classification = approved.classification;
        reason =
          p.kind === "closed_fixture"
            ? "CLOSED_FIXTURE"
            : "ARCHIVED_EXACT_RECONSTRUCTION";
      } else if (
        approved.classification === "HISTORICAL_COMPLETED_OR_SUPERSEDED" &&
        p.kind === "applied_purchase" &&
        input.applied
      ) {
        classification = approved.classification;
        reason = "UNIQUE_APPLIED_PURCHASE";
      } else reason = "AUTHORITY_OR_PROVENANCE_UNPROVEN";
    } else if (approved && (!input.consistent || !input.noOpenWork))
      reason = "EVIDENCE_OR_WORK_UNSAFE";
    return {
      eventSha256: input.eventSha256,
      inputsSha256: input.inputsSha256,
      classification,
      reason,
    };
  });
  // Removal of a reviewed row is not a successful drain.
  const missingReviewedCount = review.records.filter(
    (r) => !inputs.some((i) => i.eventSha256 === r.eventSha256),
  ).length;
  const body = {
    schemaVersion: 1,
    reviewSha256: evidenceDigest(review),
    retainedNonterminalWebhookCount: records.length,
    activeBlockingWebhookCount: records.filter(
      (r) => r.classification === "ACTIVE_BLOCKING",
    ).length,
    historicalSafeWebhookCount: records.filter(
      (r) => r.classification !== "ACTIVE_BLOCKING",
    ).length,
    missingReviewedCount,
    records,
  };
  return { ...body, digest: evidenceDigest(body) };
}
export function assertWebhookHistory(report, reviewDigest) {
  ensure(
    report?.schemaVersion === 1 && Array.isArray(report.records),
    "RELEASE_WEBHOOK_EVIDENCE_MISSING",
  );
  const { digest: actual, ...body } = report;
  ensure(
    actual === evidenceDigest(body) &&
      report.reviewSha256 === reviewDigest &&
      report.records.every(
        (r) =>
          digest.safeParse(r.eventSha256).success &&
          digest.safeParse(r.inputsSha256).success &&
          [
            "ACTIVE_BLOCKING",
            "SYNTHETIC_TEST_HISTORY",
            "HISTORICAL_COMPLETED_OR_SUPERSEDED",
          ].includes(r.classification),
      ) &&
      report.retainedNonterminalWebhookCount === report.records.length &&
      report.activeBlockingWebhookCount ===
        report.records.filter((r) => r.classification === "ACTIVE_BLOCKING")
          .length &&
      report.historicalSafeWebhookCount ===
        report.records.filter((r) => r.classification !== "ACTIVE_BLOCKING")
          .length &&
      Number.isSafeInteger(report.missingReviewedCount) &&
      report.missingReviewedCount >= 0,
    "RELEASE_WEBHOOK_EVIDENCE_INVALID",
  );
  ensure(
    report.activeBlockingWebhookCount === 0 &&
      report.missingReviewedCount === 0,
    "RELEASE_WEBHOOK_HISTORY_BLOCKING",
  );
}
