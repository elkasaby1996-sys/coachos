// Repository-authoritative deployment metadata. No transport, credentials or mutation.
export const RETIREMENT_MIGRATION =
  "20261001224659_lemon_squeezy_retirement_disposition.sql";
export const RETIREMENT_SHA =
  "a972af711406f8e337a1519cc43a2ec035aa49c55f867a220f2f811fae38163f";
export const ACTIVATION_MIGRATION =
  "20261004065506_paddle_catalogue_activation_boundary.sql";
export const ACTIVATION_SHA =
  "1ac40a8faec0b19a94d202f544e7b2cf66b4f1181d5c636f892388fff1275c3e";
export const IMMUTABLE_MIGRATION_PREFIX_SHA =
  "a3d14b4dae764206151b80c2edc303ab2a25a43b2e62fa5e58e96e45cfbba499";
export const FUNCTION_CONTRACTS = Object.freeze([
  {
    name: "billing-create-lemon-squeezy-checkout",
    classification: "LS_TOMBSTONE",
    verifyJwt: true,
    authentication: "none-static",
    unauthorized: "gateway-401; handler-410",
    retirementCode: "BILLING_PROVIDER_RETIRED",
  },
  {
    name: "billing-lemon-squeezy-webhook",
    classification: "LS_TOMBSTONE",
    verifyJwt: false,
    authentication: "none-static",
    unauthorized: "handler-410",
    retirementCode: "BILLING_PROVIDER_RETIRED",
  },
  {
    name: "billing-create-customer-portal-link",
    classification: "LS_TOMBSTONE",
    verifyJwt: true,
    authentication: "none-static",
    unauthorized: "gateway-401; handler-410",
    retirementCode: "BILLING_PORTAL_RETIRED",
  },
  {
    name: "billing-create-paddle-checkout",
    classification: "PADDLE_ACTIVE",
    verifyJwt: true,
    authentication: "getUser-and-account-owner",
    unauthorized: "401-or-403",
  },
  {
    name: "billing-paddle-webhook",
    classification: "PADDLE_ACTIVE",
    verifyJwt: false,
    authentication: "Paddle-Signature-raw-body-timestamp-HMAC",
    unauthorized: "400; oversize-413; configuration-503",
  },
  ...[
    "billing-update-payment-method",
    "billing-preview-plan-change",
    "billing-change-subscription-plan",
    "billing-cancel-scheduled-plan-change",
    "billing-refresh-plan-change",
    "billing-preview-coach-seat-change",
    "billing-change-coach-seat-quantity",
    "billing-cancel-scheduled-seat-change",
    "billing-refresh-coach-seat-change",
  ].map((name) => ({
    name,
    classification: "SHARED_PADDLE",
    verifyJwt: true,
    authentication: "getUser-and-account-owner",
    unauthorized: "401-or-403",
  })),
  ...["open-wearables", "exercise-dataset-search"].map((name) => ({
    name,
    classification: "NON_BILLING",
    verifyJwt: true,
    authentication: "existing-gateway-contract",
    unauthorized: "401-or-403",
  })),
]);
export const LS_TOMBSTONES = Object.freeze(
  FUNCTION_CONTRACTS.filter((f) => f.classification === "LS_TOMBSTONE").map(
    (f) => f.name,
  ),
);
export const BILLING_FUNCTIONS = Object.freeze(
  FUNCTION_CONTRACTS.filter((f) => f.classification !== "NON_BILLING").map(
    (f) => f.name,
  ),
);
export const NONBILLING_FUNCTIONS = Object.freeze(
  FUNCTION_CONTRACTS.filter((f) => f.classification === "NON_BILLING").map(
    (f) => f.name,
  ),
);
export const JWT_CONTRACTS = Object.freeze(
  Object.fromEntries(FUNCTION_CONTRACTS.map((f) => [f.name, f.verifyJwt])),
);
// Present in source, but outside this billing deployment unit; never implicitly delete it remotely.
export const OUTSIDE_BILLING_DEPLOYMENT = Object.freeze([
  "marketing-lead-submit",
]);
export const CONFIGURATION_CLASSES = Object.freeze({
  PADDLE_REQUIRED: [
    "PADDLE_ENVIRONMENT",
    "PADDLE_SANDBOX_API_KEY",
    "PADDLE_SANDBOX_CHECKOUT_API_KEY",
    "PADDLE_SANDBOX_PAYMENT_METHOD_API_KEY",
    "PADDLE_SANDBOX_WEBHOOK_SECRET",
    "PADDLE_SANDBOX_PAYMENT_PAGE_URL",
    "PADDLE_CHECKOUT_ACCESS_MODE",
    "VITE_PADDLE_SANDBOX_CLIENT_TOKEN",
  ],
  SHARED_REQUIRED: [
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPEN_WEARABLES_API_URL",
    "OPEN_WEARABLES_API_KEY",
    "ALLOWED_WEARABLE_REDIRECT_ORIGINS",
    "EXERCISE_DATASET_BASE_URL",
    "EXERCISE_DATASET_API_KEY",
    "EXERCISE_DATASET_API_KEY_HEADER",
  ],
  LS_RETIREMENT_PENDING_REMOTE_REMOVAL: [
    "LEMONSQUEEZY_API_KEY",
    "LEMONSQUEEZY_WEBHOOK_SECRET",
    "BILLING_PROVIDER_ENVIRONMENT",
    "BILLING_APP_BASE_URL",
    "BILLING_PORTAL_ALLOWED_HOSTS",
  ],
  HISTORICAL_ONLY: [
    "LS store/product/variant configuration in immutable historical schema",
  ],
});
export const SECRET_NAMES = Object.freeze([
  ...CONFIGURATION_CLASSES.SHARED_REQUIRED,
  ...CONFIGURATION_CLASSES.PADDLE_REQUIRED,
]);
export const OPTIONAL_PADDLE_CONFIGURATION = Object.freeze([
  "PADDLE_SANDBOX_WEBHOOK_SECRET_PREVIOUS",
  "PADDLE_SANDBOX_HOSTED_CHECKOUT_LAUNCH_URL",
  "PADDLE_CHECKOUT_PILOT_USER_ID",
]);
export const SCENARIO_ASSERTIONS = Object.freeze({
  "CERT-DEPLOY-001": "MIGRATION_HISTORY_MATCH",
  "CERT-DEPLOY-002": "FUNCTION_DEPLOYED",
  "CERT-AUTH-001": "AUTH_REDIRECT_MATCH",
  "CERT-CATALOGUE-001": "CATALOGUE_MATCH",
  "CERT-CHECKOUT-001": "SUBSCRIPTION_ACTIVE",
  "CERT-CHECKOUT-002": "SUBSCRIPTION_ACTIVE",
  "CERT-WEBHOOK-001": "VALID_SIGNATURE_ACCEPTED",
  "CERT-WEBHOOK-002": "INVALID_SIGNATURE_REJECTED",
  "CERT-WEBHOOK-003": "REPLAY_IDEMPOTENT",
  "CERT-WEBHOOK-004": "OUT_OF_ORDER_FENCED",
  "CERT-PLAN-001": "PLAN_UPGRADED",
  "CERT-PLAN-002": "PLAN_SCHEDULED",
  "CERT-PLAN-003": "PLAN_CANCELLATION_UNSUPPORTED",
  "CERT-PLAN-004": "PLAN_BOUNDARY_APPLIED",
  "CERT-SEAT-001": "SEAT_PAYMENT_APPLIED",
  "CERT-SEAT-002": "SEAT_REDUCTION_SCHEDULED",
  "CERT-SEAT-003": "SEAT_CANCELLATION_UNSUPPORTED",
  "CERT-SEAT-004": "SEAT_BOUNDARY_APPLIED",
  "CERT-PAYMENT-001": "PAYMENT_METHOD_UPDATED",
  "CERT-RECOVERY-001": "PAYMENT_RECOVERED",
  "CERT-ACCESS-001": "ACCESS_FULL",
  "CERT-ACCESS-002": "ACCESS_EXISTING_DELIVERY",
  "CERT-ACCESS-003": "ACCESS_RECOVERY_ONLY",
  "CERT-TRIAL-001": "TRIAL_CONVERTED",
  "CERT-SECURITY-001": "REDACTION_PASSED",
  "CERT-SECURITY-002": "CROSS_ACCOUNT_DENIED",
  "CERT-AMBIGUITY-001": "AMBIGUITY_FENCED",
  "CERT-ROLLBACK-001": "ROLLBACK_VERIFIED",
  "CERT-LS-NEGATIVE-001": "LS_RETIRED_NO_SIDE_EFFECTS",
  "CERT-SUBSCRIPTION-001": "SUBSCRIPTION_CANCELLATION_SUPPORTED",
  "CERT-SUBSCRIPTION-002": "SUBSCRIPTION_RESUME_SUPPORTED",
});
export const SCENARIO_IDS = Object.freeze(Object.keys(SCENARIO_ASSERTIONS));
export const UNSUPPORTED_SCENARIOS = Object.freeze([
  "CERT-PLAN-003",
  "CERT-SEAT-003",
  "CERT-SUBSCRIPTION-001",
  "CERT-SUBSCRIPTION-002",
]);
export const EVIDENCE_CLASSES = Object.freeze([
  "HISTORICALLY_CERTIFIED_BEFORE_CURRENT_ARCHITECTURE",
  "IMPLEMENTED_LOCAL",
  "IMPLEMENTED_NEEDS_REMOTE_CERTIFICATION",
  "NOT_IMPLEMENTED",
  "INTENTIONALLY_UNSUPPORTED",
  "PRODUCT_DECISION_PENDING",
]);
