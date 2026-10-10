// Offline qualification only. Response bodies/claims are injected data, not
// authenticated by this module. Never supplies validateFounderAction's proof.
// Documented sources and limitations: docs/staging-founder-github-evidence.md.
import { z } from "zod";

const id = z.string().regex(/^[1-9][0-9]*$/);
const apiId = z.number().int().positive().safe().transform(String);
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const timestamp = z.string().datetime();
const user = z.object({ id: apiId, type: z.literal("User") });
const repository = z.object({
  id: apiId,
  full_name: z.string(),
  owner: z.object({ id: apiId }),
  default_branch: z.string(),
});
const run = z.object({
  id: apiId,
  workflow_id: apiId,
  run_attempt: z.number().int().positive().safe(),
  event: z.string(),
  head_branch: z.string(),
  head_sha: sha,
  head_commit: z.object({ id: sha, tree_id: sha }),
  repository: repository.omit({ default_branch: true }),
  actor: user,
  triggering_actor: user,
  status: z.string(),
});
const check = z.object({
  id: apiId,
  name: z.string(),
  head_sha: sha,
  app: z.object({ id: apiId }),
  status: z.string(),
  conclusion: z.string().nullable(),
  completed_at: timestamp.nullable(),
});
const request = z.strictObject({
  repository: z.literal("elkasaby1996-sys/coachos"),
  runId: id.optional(),
  attempt: z.number().int().positive().safe().optional(),
  workflowId: id.optional(),
  ref: z.string().optional(),
  environment: z.string().optional(),
  page: z.number().int().positive().safe().optional(),
  perPage: z.number().int().min(1).max(100).optional(),
  filter: z.literal("all").optional(),
});
// Acquisition metadata belongs to the future trusted reader, not GitHub's body.
// It is deliberately never labelled authenticated or accepted as authority.
const response = z.strictObject({
  request,
  observedAt: timestamp,
  status: z.number().int().min(100).max(599).nullable(),
  headers: z.strictObject({
    link: z.string().nullable(),
    rateLimitRemaining: z.string().nullable(),
  }),
  transportError: z.enum(["timeout", "network"]).nullable(),
  body: z.unknown(),
});
const expectedSchema = z.strictObject({
  repository: z.literal("elkasaby1996-sys/coachos"),
  repositoryId: id,
  ownerId: id,
  workflowId: id,
  workflowName: z.enum([
    "Supabase Staging Empty Bootstrap",
    "Supabase Staging Commercial Certification",
  ]),
  workflowPath: z.enum([
    ".github/workflows/supabase-staging-bootstrap.yml",
    ".github/workflows/supabase-deploy-staging.yml",
  ]),
  runId: id,
  runAttempt: z.number().int().positive().safe(),
  jobId: id,
  actorId: id,
  triggeringActorId: id,
  approverId: id,
  commit: sha,
  tree: sha,
  environmentId: id,
  environment: z.literal("supabase-staging"),
  requiredChecks: z
    .array(z.strictObject({ name: z.string().min(1), appId: id }))
    .min(1),
  oidcAudience: z.string().min(1),
  oidcSubject: z.string().min(1),
});
const evidenceSchema = z.strictObject({
  repository: z.unknown().optional(),
  workflow: z.unknown().optional(),
  run: z.unknown().optional(),
  attempt: z.unknown().optional(),
  jobs: z.array(z.unknown()).optional(),
  commit: z.unknown().optional(),
  branch: z.unknown().optional(),
  environment: z.unknown().optional(),
  branchProtection: z.unknown().optional(),
  rules: z.array(z.unknown()).optional(),
  checks: z.array(z.unknown()).optional(),
  reviews: z.unknown().optional(),
  deployment: z.unknown().optional(),
  deploymentReviewWebhook: z.unknown().optional(),
  oidc: z.unknown().optional(),
});
export const GITHUB_EVIDENCE_MAX_AGE_MS = 15 * 60_000;
const sameRequest = (actual, expected) =>
  Object.keys(actual).length === Object.keys(expected).length &&
  Object.entries(expected).every(([key, value]) => actual[key] === value);
const outcome = (status, code) => ({ status, code });
const unsupported = (code) => outcome("unsupported", code);
const denied = (code) => outcome("denied", code);
const matches = () =>
  outcome("matches_documented_fields", "GITHUB_FIELDS_MATCH");

/**
 * Pure diagnostic projection of synthetic or previously acquired records.
 * `expected` must eventually come from reviewed policy; neither that trust nor
 * HTTP/JWT/webhook authenticity is established here. There is no success branch.
 * API bodies permit unrelated GitHub fields, but evaluate only documented fields.
 * All output is allowlisted codes; private response values are never returned.
 */
export function evaluateFounderGitHubEvidence({ expected, evidence, now }) {
  const predicates = {};
  const finish = () => {
    const failure = Object.values(predicates).find(
      (p) => p.status === "denied",
    );
    return {
      schemaVersion: 1,
      operational: false,
      status: failure ? "denied" : "unsupported",
      code: failure?.code ?? "APPROVAL_EVIDENCE_UNSUPPORTED",
      authenticity: "NOT_ESTABLISHED_BY_OFFLINE_ADAPTER",
      predicates,
    };
  };
  const parsed = expectedSchema.safeParse(expected);
  const supplied = evidenceSchema.safeParse(evidence);
  if (!parsed.success || !Number.isSafeInteger(now) || now < 0) {
    predicates.expectations = unsupported("GITHUB_EXPECTATIONS_INVALID");
    return finish();
  }
  if (!supplied.success) {
    predicates.input = unsupported("GITHUB_EVIDENCE_INVALID");
    return finish();
  }
  const e = parsed.data;
  const records = supplied.data;
  if (
    new Set(e.requiredChecks.map((c) => c.name)).size !==
      e.requiredChecks.length ||
    e.actorId !== e.triggeringActorId ||
    e.actorId !== e.approverId ||
    e.workflowPath.endsWith("supabase-staging-bootstrap.yml") !==
      (e.workflowName === "Supabase Staging Empty Bootstrap")
  ) {
    predicates.expectations = unsupported("GITHUB_EXPECTATIONS_INVALID");
    return finish();
  }
  const base = { repository: e.repository };
  const runRequest = { ...base, runId: e.runId };
  const fresh = (observedAt) => {
    const time = Date.parse(observedAt);
    return time <= now && now - time <= GITHUB_EVIDENCE_MAX_AGE_MS;
  };
  const runMatches = (r) =>
    r.id === e.runId &&
    r.run_attempt === e.runAttempt &&
    r.workflow_id === e.workflowId &&
    r.repository.id === e.repositoryId &&
    r.repository.owner.id === e.ownerId &&
    r.repository.full_name === e.repository &&
    r.actor.id === e.actorId &&
    r.triggering_actor.id === e.triggeringActorId &&
    r.event === "workflow_dispatch" &&
    r.head_branch === "main" &&
    r.head_sha === e.commit &&
    r.head_commit.id === e.commit &&
    r.head_commit.tree_id === e.tree;
  function read(name, raw, schema, requested) {
    if (raw === undefined) {
      predicates[name] = unsupported("GITHUB_EVIDENCE_MISSING");
      return;
    }
    const result = response.safeParse(raw);
    if (!result.success) {
      predicates[name] = unsupported("GITHUB_RESPONSE_INVALID");
      return;
    }
    const r = result.data;
    if (!sameRequest(r.request, requested)) {
      predicates[name] = denied("GITHUB_REQUEST_BINDING_MISMATCH");
      return;
    }
    if (!fresh(r.observedAt)) {
      predicates[name] = unsupported("GITHUB_EVIDENCE_STALE");
      return;
    }
    if (r.transportError) {
      predicates[name] = unsupported(
        r.transportError === "timeout"
          ? "GITHUB_TIMEOUT"
          : "GITHUB_NETWORK_ERROR",
      );
      return;
    }
    if (r.status !== 200) {
      predicates[name] = unsupported(
        r.status === 429 ||
          (r.status === 403 && r.headers.rateLimitRemaining === "0")
          ? "GITHUB_RATE_LIMITED"
          : "GITHUB_API_ERROR",
      );
      return;
    }
    const body = schema.safeParse(r.body);
    if (!body.success) {
      predicates[name] = unsupported("GITHUB_RESPONSE_INVALID");
      return;
    }
    return { body: body.data, headers: r.headers };
  }
  function single(name, schema, requested) {
    const result = read(name, records[name], schema, requested);
    if (result?.headers.link) {
      predicates[name] = unsupported("GITHUB_PAGINATION_INCOMPLETE");
      return;
    }
    return result?.body;
  }
  function compare(name, value, code = "GITHUB_IDENTITY_MISMATCH") {
    predicates[name] = value ? matches() : denied(code);
  }
  function nextLink(name, value, requested, index, count) {
    if (value === null) return false;
    const paths = {
      jobs: `/repos/${e.repository}/actions/runs/${e.runId}/attempts/${e.runAttempt}/jobs`,
      checks: `/repos/${e.repository}/commits/${e.commit}/check-runs`,
      rules: `/repos/${e.repository}/rules/branches/main`,
    };
    const relations = new Set();
    for (const part of value.split(/,\s*(?=<)/)) {
      const match = /^<([^<>\s]+)>;\s*rel="(next|prev|first|last)"$/.exec(
        part.trim(),
      );
      if (!match || relations.has(match[2])) return;
      relations.add(match[2]);
      let url;
      try {
        url = new URL(match[1]);
      } catch {
        return;
      }
      const page = url.searchParams.get("page");
      if (
        url.origin !== "https://api.github.com" ||
        url.username ||
        url.password ||
        url.hash ||
        url.pathname !== paths[name] ||
        !/^[1-9][0-9]*$/.test(page ?? "") ||
        [...url.searchParams.keys()].some(
          (key) => !["page", "per_page", "filter"].includes(key),
        ) ||
        [...url.searchParams.keys()].some(
          (key) => url.searchParams.getAll(key).length !== 1,
        ) ||
        (requested.filter
          ? url.searchParams.get("filter") !== requested.filter
          : url.searchParams.has("filter"))
      )
        return;
      const size = url.searchParams.get("per_page");
      if (
        (size !== null &&
          (!/^[1-9][0-9]*$/.test(size) || Number(size) > 100)) ||
        (size === null ? 30 : Number(size)) !== (requested.perPage ?? 30)
      )
        return;
      const expectedPage = {
        next: index + 2,
        prev: index,
        first: 1,
        last: count,
      }[match[2]];
      if (Number(page) !== expectedPage) return;
    }
    return relations.has("next");
  }
  function collectionRequest(name, raw, requested) {
    const first = request.safeParse(raw[0]?.request);
    if (!first.success) {
      predicates[name] = unsupported("GITHUB_RESPONSE_INVALID");
      return;
    }
    // Bind the acquisition page size as well as every fixed endpoint parameter.
    // Omission means GitHub's default of 30, not a size inferred from Link data.
    return first.data.perPage === undefined
      ? requested
      : { ...requested, perPage: first.data.perPage };
  }
  function pages(name, rowSchema, key, requested) {
    const raw = records[name];
    if (!Array.isArray(raw) || raw.length === 0) {
      predicates[name] = unsupported("GITHUB_EVIDENCE_MISSING");
      return;
    }
    requested = collectionRequest(name, raw, requested);
    if (!requested) return;
    let total;
    const rows = [];
    for (let index = 0; index < raw.length; index++) {
      const page = read(
        name,
        raw[index],
        z.object({
          total_count: z.number().int().nonnegative().safe(),
          [key]: z.array(rowSchema),
        }),
        { ...requested, page: index + 1 },
      );
      if (!page) return;
      total ??= page.body.total_count;
      const next = nextLink(
        name,
        page.headers.link,
        requested,
        index,
        raw.length,
      );
      if (
        next === undefined ||
        total !== page.body.total_count ||
        next !== index < raw.length - 1
      ) {
        predicates[name] = unsupported("GITHUB_PAGINATION_INCOMPLETE");
        return;
      }
      rows.push(...page.body[key]);
    }
    if (
      rows.length !== total ||
      new Set(rows.map((r) => r.id)).size !== rows.length
    ) {
      predicates[name] = unsupported("GITHUB_PAGINATION_INCOMPLETE");
      return;
    }
    return rows;
  }
  function arrayPages(name, rowSchema, requested) {
    const raw = records[name];
    if (!Array.isArray(raw) || raw.length === 0) {
      predicates[name] = unsupported("GITHUB_EVIDENCE_MISSING");
      return;
    }
    requested = collectionRequest(name, raw, requested);
    if (!requested) return;
    const rows = [];
    for (let index = 0; index < raw.length; index++) {
      const page = read(name, raw[index], z.array(rowSchema), {
        ...requested,
        page: index + 1,
      });
      if (!page) return;
      const next = nextLink(
        name,
        page.headers.link,
        requested,
        index,
        raw.length,
      );
      if (next === undefined || next !== index < raw.length - 1) {
        predicates[name] = unsupported("GITHUB_PAGINATION_INCOMPLETE");
        return;
      }
      rows.push(...page.body);
    }
    return rows;
  }

  const repo = single("repository", repository, base);
  if (repo)
    compare(
      "repository",
      repo.id === e.repositoryId &&
        repo.owner.id === e.ownerId &&
        repo.full_name === e.repository &&
        repo.default_branch === "main",
    );
  const workflow = single(
    "workflow",
    z.object({
      id: apiId,
      name: z.string(),
      path: z.string(),
      state: z.string(),
    }),
    { ...base, workflowId: e.workflowId },
  );
  if (workflow)
    compare(
      "workflow",
      workflow.id === e.workflowId &&
        workflow.name === e.workflowName &&
        workflow.path === e.workflowPath &&
        workflow.state === "active",
    );
  for (const name of ["run", "attempt"]) {
    const r = single(
      name,
      run,
      name === "run" ? runRequest : { ...runRequest, attempt: e.runAttempt },
    );
    if (!r) continue;
    compare(name, runMatches(r) && r.status === "in_progress");
  }
  const jobs = pages(
    "jobs",
    z.object({ id: apiId, run_id: apiId, head_sha: sha, status: z.string() }),
    "jobs",
    { ...runRequest, attempt: e.runAttempt },
  );
  if (jobs)
    compare(
      "jobs",
      jobs.every((j) => j.run_id === e.runId && j.head_sha === e.commit) &&
        jobs.some((j) => j.id === e.jobId && j.status === "in_progress"),
    );
  const commit = single("commit", z.object({ sha, tree: z.object({ sha }) }), {
    ...base,
    ref: e.commit,
  });
  if (commit)
    compare("commit", commit.sha === e.commit && commit.tree.sha === e.tree);
  const branch = single(
    "branch",
    z.object({
      name: z.string(),
      protected: z.boolean(),
      commit: z.object({ sha }),
    }),
    { ...base, ref: "main" },
  );
  if (branch)
    compare(
      "branch",
      branch.name === "main" &&
        branch.protected &&
        branch.commit.sha === e.commit,
      "GITHUB_MAIN_PROTECTION_OR_SOURCE_MISMATCH",
    );

  const environment = single(
    "environment",
    z.object({
      id: apiId,
      name: z.string(),
      protection_rules: z.array(
        z.object({
          type: z.string(),
          prevent_self_review: z.boolean().optional(),
          reviewers: z
            .array(
              z.object({ type: z.string(), reviewer: z.object({ id: apiId }) }),
            )
            .optional(),
        }),
      ),
      deployment_branch_policy: z
        .object({
          protected_branches: z.boolean(),
          custom_branch_policies: z.boolean(),
        })
        .nullable(),
    }),
    { ...base, environment: e.environment },
  );
  if (environment) {
    const reviewers = environment.protection_rules.filter(
      (r) => r.type === "required_reviewers",
    );
    compare(
      "environment",
      environment.id === e.environmentId &&
        environment.name === e.environment &&
        reviewers.length === 1 &&
        reviewers[0].prevent_self_review === false &&
        reviewers[0].reviewers?.some(
          (r) => r.type === "User" && r.reviewer.id === e.approverId,
        ) &&
        environment.deployment_branch_policy?.protected_branches === true &&
        environment.deployment_branch_policy.custom_branch_policies === false,
      "GITHUB_ENVIRONMENT_POLICY_MISMATCH",
    );
  }
  // These are current configuration observations, not historical enforcement.
  const protection = single(
    "branchProtection",
    z.object({
      enforce_admins: z.object({ enabled: z.boolean() }),
      required_status_checks: z
        .object({
          checks: z.array(
            z.object({
              context: z.string(),
              app_id: z.number().int().safe().nullable(),
            }),
          ),
        })
        .nullable(),
    }),
    { ...base, ref: "main" },
  );
  const rules = arrayPages(
    "rules",
    z.object({
      type: z.string(),
      parameters: z
        .object({
          required_status_checks: z
            .array(
              z.object({
                context: z.string(),
                integration_id: z.number().int().safe().nullable().optional(),
              }),
            )
            .optional(),
        })
        .optional(),
    }),
    { ...base, ref: "main" },
  );
  if (protection) predicates.branchProtection = matches();
  if (rules) predicates.rules = matches();
  if (protection && rules) {
    const configured = [
      ...(protection.required_status_checks?.checks ?? []).map((c) => ({
        name: c.context,
        appId: c.app_id,
      })),
      ...rules
        .filter((r) => r.type === "required_status_checks")
        .flatMap(
          (r) =>
            r.parameters?.required_status_checks?.map((c) => ({
              name: c.context,
              appId: c.integration_id,
            })) ?? [],
        ),
    ];
    if (
      configured.some((c) => !Number.isSafeInteger(c.appId) || c.appId <= 0) ||
      rules.some(
        (r) =>
          r.type === "required_status_checks" &&
          !r.parameters?.required_status_checks,
      )
    ) {
      predicates.requiredCheckConfiguration = unsupported(
        "GITHUB_CHECK_PUBLISHER_UNBOUND",
      );
    } else {
      const keys = new Set(configured.map((c) => `${c.name}\0${c.appId}`));
      compare(
        "requiredCheckConfiguration",
        protection.enforce_admins.enabled &&
          keys.size === e.requiredChecks.length &&
          e.requiredChecks.every((c) => keys.has(`${c.name}\0${c.appId}`)),
        "GITHUB_REQUIRED_CHECK_POLICY_MISMATCH",
      );
    }
  }
  const checks = pages("checks", check, "check_runs", {
    ...base,
    ref: e.commit,
    filter: "all",
  });
  if (checks) {
    if (checks.some((c) => c.head_sha !== e.commit)) {
      predicates.checks = denied("GITHUB_CHECK_COMMIT_MISMATCH");
    } else {
      predicates.checks = matches();
      for (const required of e.requiredChecks) {
        const found = checks.filter((c) => c.name === required.name);
        if (found.length === 0) {
          predicates.checks = denied("GITHUB_REQUIRED_CHECK_MISSING");
          break;
        }
        if (found.some((c) => c.app.id !== required.appId)) {
          predicates.checks = denied("GITHUB_CHECK_PUBLISHER_MISMATCH");
          break;
        }
        if (found.length !== 1) {
          predicates.checks = unsupported("GITHUB_CHECK_RESULT_AMBIGUOUS");
          break;
        }
        const c = found[0];
        if (
          c.status !== "completed" ||
          c.conclusion !== "success" ||
          !c.completed_at ||
          Date.parse(c.completed_at) > now
        ) {
          predicates.checks = denied("GITHUB_REQUIRED_CHECK_NOT_SUCCESSFUL");
          break;
        }
      }
    }
  }
  const reviews = single(
    "reviews",
    z.array(
      z.object({
        state: z.enum(["approved", "rejected"]),
        user,
        environments: z.array(z.object({ id: apiId, name: z.string() })),
      }),
    ),
    runRequest,
  );
  if (reviews) {
    const relevant = reviews.filter((r) =>
      r.environments.some((env) => env.id === e.environmentId),
    );
    if (
      relevant.some((r) =>
        r.environments.some(
          (env) => env.id === e.environmentId && env.name !== e.environment,
        ),
      )
    )
      predicates.reviews = denied("GITHUB_ENVIRONMENT_IDENTITY_MISMATCH");
    else if (relevant.some((r) => r.state === "rejected"))
      predicates.reviews = denied("GITHUB_ENVIRONMENT_REVIEW_REJECTED");
    else if (relevant.some((r) => r.user.id !== e.approverId))
      predicates.reviews = denied("GITHUB_APPROVER_MISMATCH");
    else
      predicates.reviews = relevant.length
        ? matches()
        : unsupported("GITHUB_ENVIRONMENT_APPROVAL_MISSING");
  }
  if (records.deployment !== undefined) {
    const d = single(
      "deployment",
      z.object({ id: apiId, sha, ref: z.string(), environment: z.string() }),
      base,
    );
    if (d)
      compare(
        "deployment",
        d.sha === e.commit &&
          ["main", "refs/heads/main"].includes(d.ref) &&
          d.environment === e.environment,
      );
    predicates.deploymentApproval = unsupported(
      "APPROVAL_EVIDENCE_UNSUPPORTED",
    );
  }
  if (records.deploymentReviewWebhook !== undefined) {
    // Octokit deployment_review/approved.schema.json references the common
    // workflow-run schema (run_attempt) and job/environment records. These can
    // bind payload fields; they do not authenticate a delivery or prove no bypass.
    const reviewJob = z.object({
      id: apiId,
      environment: z.string(),
      status: z.string(),
    });
    const webhook = z
      .strictObject({
        observedAt: timestamp,
        payload: z.object({
          action: z.enum(["approved", "rejected"]),
          approver: z.object({ id: apiId }),
          repository: repository.omit({ default_branch: true }),
          since: timestamp,
          workflow_run: run.nullable(),
          workflow_job_run: reviewJob.optional(),
          workflow_job_runs: z.array(reviewJob).optional(),
        }),
      })
      .safeParse(records.deploymentReviewWebhook);
    if (!webhook.success)
      predicates.deploymentReviewWebhook = unsupported(
        "GITHUB_WEBHOOK_INVALID",
      );
    else if (!fresh(webhook.data.observedAt))
      predicates.deploymentReviewWebhook = unsupported("GITHUB_EVIDENCE_STALE");
    else {
      const p = webhook.data.payload;
      compare(
        "deploymentReviewWebhook",
        p.repository.id === e.repositoryId &&
          p.repository.owner.id === e.ownerId &&
          p.repository.full_name === e.repository &&
          p.approver.id === e.approverId,
      );
      if (p.action === "rejected")
        predicates.deploymentReviewWebhook = denied(
          "GITHUB_ENVIRONMENT_REVIEW_REJECTED",
        );
      if (
        Date.parse(p.since) > Date.parse(webhook.data.observedAt) &&
        predicates.deploymentReviewWebhook.status !== "denied"
      )
        predicates.deploymentReviewWebhook = unsupported(
          "GITHUB_WEBHOOK_TIME_INVALID",
        );
      if (p.workflow_run)
        compare(
          "webhookRunAttempt",
          runMatches(p.workflow_run),
          "GITHUB_WEBHOOK_RUN_ATTEMPT_MISMATCH",
        );
      else
        predicates.webhookRunAttempt = unsupported(
          "APPROVAL_EVIDENCE_UNSUPPORTED",
        );
      const jobs =
        p.workflow_job_runs ?? (p.workflow_job_run ? [p.workflow_job_run] : []);
      if (
        (p.workflow_job_run && p.workflow_job_runs) ||
        new Set(jobs.map((j) => j.id)).size !== jobs.length
      )
        predicates.webhookJobEnvironment = unsupported(
          "GITHUB_WEBHOOK_JOB_ASSOCIATION_AMBIGUOUS",
        );
      else if (jobs.length)
        compare(
          "webhookJobEnvironment",
          jobs.some((j) => j.id === e.jobId && j.environment === e.environment),
          "GITHUB_WEBHOOK_JOB_ENVIRONMENT_MISMATCH",
        );
      else
        predicates.webhookJobEnvironment = unsupported(
          "APPROVAL_EVIDENCE_UNSUPPORTED",
        );
    }
    predicates.webhookAuthenticityAndAttempt = unsupported(
      "APPROVAL_EVIDENCE_UNSUPPORTED",
    );
  }
  if (records.oidc !== undefined) {
    const token = z
      .strictObject({
        observedAt: timestamp,
        claims: z.object({
          iss: z.literal("https://token.actions.githubusercontent.com"),
          aud: z.string(),
          sub: z.string(),
          repository: z.string(),
          repository_id: id,
          repository_owner_id: id,
          actor_id: id,
          run_id: id,
          run_attempt: id,
          sha,
          ref: z.string(),
          event_name: z.string(),
          workflow_ref: z.string(),
          workflow_sha: sha,
          environment: z.string(),
          exp: z.number().int().safe(),
          iat: z.number().int().safe(),
          nbf: z.number().int().safe(),
          jti: z.string().min(1),
        }),
      })
      .safeParse(records.oidc);
    if (!token.success)
      predicates.oidc = unsupported("GITHUB_OIDC_CLAIMS_INVALID");
    else if (!fresh(token.data.observedAt))
      predicates.oidc = unsupported("GITHUB_EVIDENCE_STALE");
    else {
      const c = token.data.claims;
      compare(
        "oidc",
        c.aud === e.oidcAudience &&
          c.sub === e.oidcSubject &&
          c.repository === e.repository &&
          c.repository_id === e.repositoryId &&
          c.repository_owner_id === e.ownerId &&
          c.actor_id === e.actorId &&
          c.run_id === e.runId &&
          c.run_attempt === String(e.runAttempt) &&
          c.sha === e.commit &&
          c.ref === "refs/heads/main" &&
          c.event_name === "workflow_dispatch" &&
          c.workflow_ref ===
            `${e.repository}/${e.workflowPath}@refs/heads/main` &&
          c.workflow_sha === e.commit &&
          c.environment === e.environment &&
          c.nbf * 1000 <= now &&
          c.iat * 1000 <= now &&
          now < c.exp * 1000 &&
          c.iat <= c.exp &&
          c.nbf <= c.exp,
        "GITHUB_OIDC_BINDING_OR_EXPIRY_MISMATCH",
      );
    }
    predicates.oidcAuthenticity = unsupported(
      "GITHUB_OIDC_AUTHENTICATION_NOT_PERFORMED",
    );
  }
  // Neither an approved run-level review nor current protection configuration
  // establishes these predicates. Unknown is never projected as bypassUsed:false.
  predicates.approvalAttemptBinding = unsupported(
    "APPROVAL_EVIDENCE_UNSUPPORTED",
  );
  predicates.noAdministrativeBypass = unsupported(
    "APPROVAL_EVIDENCE_UNSUPPORTED",
  );
  predicates.historicalProtectionEnforcement = unsupported(
    "APPROVAL_EVIDENCE_UNSUPPORTED",
  );
  return finish();
}
