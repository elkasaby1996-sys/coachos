// One fresh synthetic owner through the existing reviewed staging workflow.
// Real payments happen later through the app; never seed billing authority.
import {
  createHash,
  createPublicKey,
  publicEncrypt,
  randomBytes,
} from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAuthSmokeFixtures } from "../tests/e2e/utils/auth-fixtures.ts";
import { installationSource } from "./staging-initial-install.mjs";
import {
  STAGING_PROJECT,
  STAGING_ORIGIN,
  readBoundedStagingJson,
} from "./staging-billing-status.mjs";
import {
  runSandboxPilot,
  validatePilotContext,
  pilotOwnerQuery,
  validatePilotOwner,
} from "./staging-sandbox-pilot.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const uuid = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
    value,
  );
const check = (value, code) => {
  if (!value) throw new Error(code);
};
export function fixtureIdentity(owner) {
  check(uuid(owner), "FIXTURE_OWNER_INVALID");
  const fixture = createAuthSmokeFixtures(
    `staging-payment-method-v1:${owner}`,
  ).ptComplete;
  return {
    email: fixture.email,
    fullName: "RepSync Sandbox Payment Method",
    workspaceName: `Sandbox Payment Method ${owner.slice(0, 8)}`,
  };
}
export function protectedOwnerQuery(owner) {
  check(uuid(owner), "FIXTURE_PROTECTED_OWNER_INVALID");
  return `with b as (select * from public.billing_accounts where owner_user_id='${owner}'),
  s as (select s.* from public.billing_subscriptions_v2 s join b on b.id=s.billing_account_id),
  retained as (
    select 'auth' kind,to_jsonb(u)::text value from auth.users u where u.id='${owner}'
    union all select 'account',to_jsonb(b)::text from b
    union all select 'canonical',to_jsonb(a)::text from public.account_subscriptions a join b on b.id=a.billing_account_id
    union all select 'subscription',to_jsonb(s)::text from s
    union all select 'operation',to_jsonb(o)::text from public.billing_operations_v2 o join b on b.id=o.billing_account_id
    union all select 'legacy_seat',to_jsonb(o)::text from public.billing_seat_quantity_operations o join b on b.id=o.billing_account_id
    union all select 'checkout',to_jsonb(c)::text from public.billing_checkouts_v2 c join b on b.id=c.billing_account_id
    union all select 'preparation',to_jsonb(p)::text from public.billing_payment_method_preparations_v2 p join b on b.id=p.billing_account_id
    union all select 'payment',to_jsonb(p)::text from public.billing_payment_applications_v2 p join b on b.id=p.billing_account_id
    union all select 'evidence',to_jsonb(e)::text from public.billing_evidence_v2 e join s on s.id=e.subscription_id
    union all select 'event',to_jsonb(e)::text from public.billing_webhook_events_v2 e join s on s.provider_subscription_ref=e.subscription_ref and s.provider=e.provider and s.environment=e.environment
  ) select (select entitlement_environment from public.billing_runtime_policy where id=1) environment,
    (select count(*)::int from b) accounts,
    (select count(*)::int from auth.users where id='${owner}') users,
    (select count(*)::int from public.billing_operations_v2 o join b on b.id=o.billing_account_id where o.status='scheduled' and o.operation_kind='seat_quantity' and o.effective_timing='period_end' and o.effective_at>clock_timestamp()) reductions,
    encode(extensions.digest(coalesce((select string_agg(kind||':'||value,'' order by kind,value) from retained),''),'sha256'),'hex') fingerprint;`;
}
export function encryptFixture(credentials, pem) {
  const key = createPublicKey(pem);
  check(
    key.asymmetricKeyType === "rsa" &&
      key.asymmetricKeyDetails?.modulusLength === 4096,
    "FIXTURE_PUBLIC_KEY_INVALID",
  );
  return publicEncrypt(
    { key, oaepHash: "sha256" },
    Buffer.from(JSON.stringify(credentials)),
  ).toString("base64");
}
export async function preparePaymentMethodFixture({
  env = process.env,
  root = process.cwd(),
  transport = fetch,
  readSource = () => installationSource(root),
  pilot = runSandboxPilot,
  saveEncrypted = (cipher) => {
    const destination = join(
      resolve(env.RUNNER_TEMP),
      "staging-payment-method-fixture",
      "credentials.enc",
    );
    const rel = relative(resolve(root), destination);
    check(rel.startsWith(".."), "FIXTURE_OUTPUT_INSIDE_CHECKOUT");
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    writeFileSync(destination, cipher, { mode: 0o600, flag: "wx" });
  },
} = {}) {
  const report = {
    status: "blocked",
    stage: "context",
    project: STAGING_PROJECT,
    remoteWritesMayHaveOccurred: false,
    fixtureCreated: false,
    pilotChanged: false,
    originalPreserved: false,
    paymentsCreated: false,
  };
  try {
    const source = readSource();
    validatePilotContext(env, source, "pause_checkout");
    const owner = env.STAGING_FIXTURE_USER_ID,
      protectedOwner = env.STAGING_PILOT_USER_ID;
    check(
      uuid(owner) && owner !== protectedOwner,
      "FIXTURE_DISTINCT_NEW_OWNER_REQUIRED",
    );
    const identity = fixtureIdentity(owner);
    const credentials = {
      project: STAGING_PROJECT,
      origin: STAGING_ORIGIN,
      owner,
      email: identity.email,
      password: randomBytes(32).toString("base64url"),
    };
    // Validate recipient and encrypt before any remote writes. Never print the login.
    const cipher = encryptFixture(credentials, env.STAGING_FIXTURE_PUBLIC_KEY);
    check(
      typeof env.RUNNER_TEMP === "string" && env.RUNNER_TEMP.length > 0,
      "FIXTURE_RUNNER_TEMP_REQUIRED",
    );
    const assertSource = () => {
      const current = readSource();
      validatePilotContext(env, current, "pause_checkout");
      check(
        current.commit === source.commit &&
          current.identity.payload.digest === source.identity.payload.digest,
        "FIXTURE_SOURCE_CHANGED",
      );
    };
    const request = async (url, method = "GET", body, headers = {}) => {
      const response = await transport(url, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        headers: { "Content-Type": "application/json", ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      check(response.ok, "FIXTURE_REQUEST_FAILED");
      return readBoundedStagingJson(response);
    };
    const management = (path, method = "GET", body) =>
      request(
        `https://api.supabase.com/v1/projects/${STAGING_PROJECT}/${path}`,
        method,
        body,
        { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN.trim()}` },
      );
    const sql = (query) =>
      management("database/query/read-only", "POST", { query });
    report.commit = source.commit;
    report.ownerSha256 = hash(owner);
    report.publicKeySha256 = hash(env.STAGING_FIXTURE_PUBLIC_KEY);
    report.stage = "verify_original_and_fresh_owner";
    const original = (await sql(protectedOwnerQuery(protectedOwner)))?.[0];
    check(
      original?.environment === "test" &&
        original?.accounts === 1 &&
        original.users === 1 &&
        original.reductions === 1 &&
        /^[a-f0-9]{64}$/.test(original.fingerprint),
      "FIXTURE_ORIGINAL_NOT_CONFIRMED",
    );
    const fresh = await sql(
      `select exists(select 1 from auth.users where id='${owner}' or email='${identity.email}') as occupied;`,
    );
    check(
      fresh?.length === 1 && fresh[0].occupied === false,
      "FIXTURE_OWNER_ALREADY_EXISTS",
    );
    // Use an existing server API key only within this protected process.
    // It is never sent to the browser, included in artifacts or changed.
    report.stage = "read_server_auth_capability";
    const keys = await management("api-keys?reveal=true");
    const service = keys?.find((key) => key.name === "service_role")?.api_key;
    const anon = keys?.find((key) => key.name === "anon")?.api_key;
    check(
      typeof service === "string" &&
        service.startsWith("eyJ") &&
        typeof anon === "string" &&
        anon.startsWith("eyJ"),
      "FIXTURE_AUTH_CAPABILITY_UNAVAILABLE",
    );
    saveEncrypted(cipher);
    report.encryptedCredentialsSha256 = hash(cipher);
    assertSource();
    const project = (path, method, body, key, token = key, headers = {}) =>
      request(`https://${STAGING_PROJECT}.supabase.co/${path}`, method, body, {
        apikey: key,
        Authorization: `Bearer ${token}`,
        ...headers,
      });
    report.stage = "create_confirmed_synthetic_user";
    report.remoteWritesMayHaveOccurred = true;
    const created = await project(
      "auth/v1/admin/users",
      "POST",
      {
        id: owner,
        email: identity.email,
        password: credentials.password,
        email_confirm: true,
        user_metadata: { full_name: identity.fullName },
        app_metadata: { repsync_sandbox_fixture: "payment-method-v1" },
      },
      service,
    );
    check(
      (created.user ?? created).id === owner,
      "FIXTURE_CREATED_OWNER_MISMATCH",
    );
    report.fixtureCreated = true;
    report.stage = "create_owned_trial_workspace";
    const session = await project(
      "auth/v1/token?grant_type=password",
      "POST",
      { email: identity.email, password: credentials.password },
      anon,
    );
    check(
      session.user?.id === owner && typeof session.access_token === "string",
      "FIXTURE_SESSION_MISMATCH",
    );
    const token = session.access_token;
    const profiles = await project(
      "rest/v1/pt_profiles",
      "POST",
      {
        user_id: owner,
        workspace_id: null,
        full_name: identity.fullName,
        display_name: identity.fullName,
        onboarding_completed_at: new Date().toISOString(),
      },
      anon,
      token,
      { Prefer: "return=representation" },
    );
    check(
      profiles?.length === 1 && profiles[0].user_id === owner,
      "FIXTURE_PROFILE_MISMATCH",
    );
    const workspace = await project(
      "rest/v1/rpc/create_workspace",
      "POST",
      { p_name: identity.workspaceName },
      anon,
      token,
    );
    check(
      workspace?.length === 1 && uuid(workspace[0].workspace_id),
      "FIXTURE_WORKSPACE_MISSING",
    );
    validatePilotOwner(await sql(pilotOwnerQuery(owner)));
    const preserve = async () =>
      check(
        (await sql(protectedOwnerQuery(protectedOwner)))?.[0]?.fingerprint ===
          original.fingerprint,
        "FIXTURE_ORIGINAL_CHANGED",
      );
    await preserve();
    assertSource();
    report.stage = "pause_previous_checkout_pilot";
    const paused = await pilot({
      mode: "pause_checkout",
      env,
      root,
      transport,
      readSource,
    });
    check(paused.status === "checkout_paused", "FIXTURE_PILOT_PAUSE_FAILED");
    report.pilotChanged = true;
    await preserve();
    report.stage = "authorize_new_checkout_pilot";
    const activated = await pilot({
      mode: "enable_pilot",
      env: { ...env, STAGING_PILOT_USER_ID: owner },
      root,
      transport,
      readSource,
    });
    check(activated.status === "pilot_enabled", "FIXTURE_PILOT_ENABLE_FAILED");
    await preserve();
    report.originalPreserved = true;
    report.originalFingerprint = original.fingerprint;
    report.status = "fixture_ready_for_sandbox_checkout";
    report.stage = "complete";
  } catch (error) {
    const known =
      /^FIXTURE_[A-Z_]+$/.test(error?.message ?? "") ||
      /^PILOT_[A-Z_]+$/.test(error?.message ?? "");
    report.code = known ? error.message : "FIXTURE_PREPARATION_FAILED";
  }
  return report;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const report = await preparePaymentMethodFixture();
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "fixture_ready_for_sandbox_checkout")
    process.exitCode = 1;
}
