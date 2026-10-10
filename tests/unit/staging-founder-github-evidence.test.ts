import { describe, expect, it, vi } from "vitest";
import {
  evaluateFounderGitHubEvidence,
  GITHUB_EVIDENCE_MAX_AGE_MS,
} from "../../scripts/staging-founder-github-evidence.mjs";

// Synthetic documented API fields. The surrounding request/status/time/header
// envelope is our future reader's acquisition metadata, not a GitHub API body.
const now = Date.parse("2026-10-10T12:00:00Z");
const observedAt = new Date(now).toISOString();
const repository = "elkasaby1996-sys/coachos";
const commit = "a".repeat(40);
const tree = "b".repeat(40);
const user = (id: number) => ({ id, type: "User" });
const repo = {
  id: 123,
  full_name: repository,
  owner: { id: 456 },
  default_branch: "main",
};
const request = (
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({ repository, ...extra });
const response = (body: unknown, extra = {}) => ({
  request: request(extra),
  observedAt,
  status: 200,
  headers: {
    link: null as string | null,
    rateLimitRemaining: null as string | null,
  },
  transportError: null as string | null,
  body: structuredClone(body),
});
function fixture(): any {
  const run = {
    id: 789,
    workflow_id: 10,
    run_attempt: 2,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: commit,
    head_commit: { id: commit, tree_id: tree },
    repository: repo,
    actor: user(42),
    triggering_actor: user(42),
    status: "in_progress",
  };
  return {
    now,
    expected: {
      repository,
      repositoryId: "123",
      ownerId: "456",
      workflowId: "10",
      workflowName: "Supabase Staging Empty Bootstrap",
      workflowPath: ".github/workflows/supabase-staging-bootstrap.yml",
      runId: "789",
      runAttempt: 2,
      jobId: "11",
      actorId: "42",
      triggeringActorId: "42",
      approverId: "42",
      commit,
      tree,
      environmentId: "12",
      environment: "supabase-staging",
      requiredChecks: [{ name: "quality", appId: "13" }],
      oidcAudience: "urn:synthetic:staging-evidence",
      oidcSubject: `repo:${repository}:environment:supabase-staging`,
    },
    evidence: {
      repository: response(repo),
      workflow: response(
        {
          id: 10,
          name: "Supabase Staging Empty Bootstrap",
          path: ".github/workflows/supabase-staging-bootstrap.yml",
          state: "active",
        },
        { workflowId: "10" },
      ),
      run: response(run, { runId: "789" }),
      attempt: response(structuredClone(run), { runId: "789", attempt: 2 }),
      jobs: [
        response(
          {
            total_count: 1,
            jobs: [
              { id: 11, run_id: 789, head_sha: commit, status: "in_progress" },
            ],
          },
          { runId: "789", attempt: 2, page: 1 },
        ),
      ],
      commit: response({ sha: commit, tree: { sha: tree } }, { ref: commit }),
      branch: response(
        { name: "main", protected: true, commit: { sha: commit } },
        { ref: "main" },
      ),
      environment: response(
        {
          id: 12,
          name: "supabase-staging",
          protection_rules: [
            {
              type: "required_reviewers",
              prevent_self_review: false,
              reviewers: [{ type: "User", reviewer: user(42) }],
            },
          ],
          deployment_branch_policy: {
            protected_branches: true,
            custom_branch_policies: false,
          },
        },
        { environment: "supabase-staging" },
      ),
      branchProtection: response(
        {
          enforce_admins: { enabled: true },
          required_status_checks: {
            checks: [{ context: "quality", app_id: 13 }],
          },
        },
        { ref: "main" },
      ),
      rules: [response([], { ref: "main", page: 1 })],
      checks: [
        response(
          {
            total_count: 1,
            check_runs: [
              {
                id: 14,
                name: "quality",
                head_sha: commit,
                app: { id: 13 },
                status: "completed",
                conclusion: "success",
                completed_at: observedAt,
              },
            ],
          },
          { ref: commit, filter: "all", page: 1 },
        ),
      ],
      reviews: response(
        [
          {
            state: "approved",
            user: user(42),
            environments: [{ id: 12, name: "supabase-staging" }],
          },
        ],
        { runId: "789" },
      ),
    },
  };
}
const evaluate = (input = fixture()) => evaluateFounderGitHubEvidence(input);
const matched = {
  status: "matches_documented_fields",
  code: "GITHUB_FIELDS_MATCH",
};
function expectBlocked(result: any) {
  expect(result.operational).toBe(false);
  expect(["unsupported", "denied"]).toContain(result.status);
  expect(result).not.toHaveProperty("bypassUsed");
  expect(result).not.toHaveProperty("environmentApproved");
  expect(result.authenticity).toBe("NOT_ESTABLISHED_BY_OFFLINE_ADAPTER");
}

describe("offline GitHub founder evidence qualification", () => {
  it.each([
    "repository",
    "workflow",
    "run",
    "attempt",
    "jobs",
    "commit",
    "branch",
    "environment",
    "branchProtection",
    "rules",
    "requiredCheckConfiguration",
    "checks",
    "reviews",
  ])(
    "recognizes documented %s fields without conferring authority",
    (predicate) => {
      const result = evaluate();
      expect(result.predicates[predicate]).toEqual(matched);
      expect(result.code).toBe("APPROVAL_EVIDENCE_UNSUPPORTED");
      expectBlocked(result);
    },
  );
  it("approved review history still cannot prove attempt association or no bypass", () => {
    const result = evaluate();
    expect(result.predicates.reviews).toEqual(matched);
    for (const predicate of [
      "approvalAttemptBinding",
      "noAdministrativeBypass",
      "historicalProtectionEnforcement",
    ])
      expect(result.predicates[predicate]).toEqual({
        status: "unsupported",
        code: "APPROVAL_EVIDENCE_UNSUPPORTED",
      });
    expectBlocked(result);
  });
  it("never manufactures bypass evidence from plausible undocumented body properties", () => {
    const f = fixture();
    f.evidence.environment.body.can_admins_bypass = false;
    Object.assign(f.evidence.reviews.body[0], {
      run_attempt: 2,
      bypassUsed: false,
      environmentApproved: true,
    });
    const result = evaluate(f);
    expect(result.predicates.noAdministrativeBypass.status).toBe("unsupported");
    expect(result.predicates.approvalAttemptBinding.status).toBe("unsupported");
    expectBlocked(result);
  });
  it("missing approval is distinct from an explicitly rejected environment review", () => {
    const f = fixture();
    expect(evaluate(f).predicates.reviews).toEqual(matched);
    f.evidence.reviews.body = [];
    expect(evaluate(f).predicates.reviews).toEqual({
      status: "unsupported",
      code: "GITHUB_ENVIRONMENT_APPROVAL_MISSING",
    });
    f.evidence.reviews.body = [
      {
        state: "rejected",
        user: user(42),
        environments: [{ id: 12, name: "supabase-staging" }],
      },
    ];
    expect(evaluate(f).predicates.reviews).toEqual({
      status: "denied",
      code: "GITHUB_ENVIRONMENT_REVIEW_REJECTED",
    });
  });
  const mismatches: [string, string, (f: any) => void, string][] = [
    [
      "default branch",
      "repository",
      (f) => (f.evidence.repository.body.default_branch = "other"),
      "GITHUB_IDENTITY_MISMATCH",
    ],
    [
      "repository id",
      "repository",
      (f) => f.evidence.repository.body.id++,
      "GITHUB_IDENTITY_MISMATCH",
    ],
    [
      "repository owner",
      "repository",
      (f) => f.evidence.repository.body.owner.id++,
      "GITHUB_IDENTITY_MISMATCH",
    ],
    [
      "repository name",
      "repository",
      (f) => (f.evidence.repository.body.full_name = "other/repo"),
      "GITHUB_IDENTITY_MISMATCH",
    ],
    [
      "workflow id",
      "workflow",
      (f) => f.evidence.workflow.body.id++,
      "GITHUB_IDENTITY_MISMATCH",
    ],
    [
      "workflow path",
      "workflow",
      (f) => (f.evidence.workflow.body.path = ".github/workflows/other.yml"),
      "GITHUB_IDENTITY_MISMATCH",
    ],
    [
      "workflow name",
      "workflow",
      (f) => (f.evidence.workflow.body.name = "other"),
      "GITHUB_IDENTITY_MISMATCH",
    ],
    [
      "run id",
      "run",
      (f) => f.evidence.run.body.id++,
      "GITHUB_IDENTITY_MISMATCH",
    ],
    [
      "run attempt",
      "run",
      (f) => f.evidence.run.body.run_attempt++,
      "GITHUB_IDENTITY_MISMATCH",
    ],
    [
      "attempt actor",
      "attempt",
      (f) => f.evidence.attempt.body.actor.id++,
      "GITHUB_IDENTITY_MISMATCH",
    ],
    [
      "triggering actor",
      "attempt",
      (f) => f.evidence.attempt.body.triggering_actor.id++,
      "GITHUB_IDENTITY_MISMATCH",
    ],
    [
      "run workflow",
      "attempt",
      (f) => f.evidence.attempt.body.workflow_id++,
      "GITHUB_IDENTITY_MISMATCH",
    ],
    [
      "run commit",
      "attempt",
      (f) => (f.evidence.attempt.body.head_sha = "c".repeat(40)),
      "GITHUB_IDENTITY_MISMATCH",
    ],
    [
      "run tree",
      "attempt",
      (f) => (f.evidence.attempt.body.head_commit.tree_id = "c".repeat(40)),
      "GITHUB_IDENTITY_MISMATCH",
    ],
    [
      "event",
      "attempt",
      (f) => (f.evidence.attempt.body.event = "pull_request"),
      "GITHUB_IDENTITY_MISMATCH",
    ],
    [
      "run branch",
      "attempt",
      (f) => (f.evidence.attempt.body.head_branch = "feature"),
      "GITHUB_IDENTITY_MISMATCH",
    ],
    [
      "cancelled run",
      "attempt",
      (f) => (f.evidence.attempt.body.status = "completed"),
      "GITHUB_IDENTITY_MISMATCH",
    ],
    [
      "job run",
      "jobs",
      (f) => f.evidence.jobs[0].body.jobs[0].run_id++,
      "GITHUB_IDENTITY_MISMATCH",
    ],
    [
      "job commit",
      "jobs",
      (f) => (f.evidence.jobs[0].body.jobs[0].head_sha = "c".repeat(40)),
      "GITHUB_IDENTITY_MISMATCH",
    ],
    [
      "job id",
      "jobs",
      (f) => f.evidence.jobs[0].body.jobs[0].id++,
      "GITHUB_IDENTITY_MISMATCH",
    ],
    [
      "Git commit",
      "commit",
      (f) => (f.evidence.commit.body.sha = "c".repeat(40)),
      "GITHUB_IDENTITY_MISMATCH",
    ],
    [
      "Git tree",
      "commit",
      (f) => (f.evidence.commit.body.tree.sha = "c".repeat(40)),
      "GITHUB_IDENTITY_MISMATCH",
    ],
    [
      "main commit",
      "branch",
      (f) => (f.evidence.branch.body.commit.sha = "c".repeat(40)),
      "GITHUB_MAIN_PROTECTION_OR_SOURCE_MISMATCH",
    ],
    [
      "unprotected main",
      "branch",
      (f) => (f.evidence.branch.body.protected = false),
      "GITHUB_MAIN_PROTECTION_OR_SOURCE_MISMATCH",
    ],
    [
      "environment id",
      "environment",
      (f) => f.evidence.environment.body.id++,
      "GITHUB_ENVIRONMENT_POLICY_MISMATCH",
    ],
    [
      "environment name",
      "environment",
      (f) => (f.evidence.environment.body.name = "production"),
      "GITHUB_ENVIRONMENT_POLICY_MISMATCH",
    ],
    [
      "self review prevented",
      "environment",
      (f) =>
        (f.evidence.environment.body.protection_rules[0].prevent_self_review = true),
      "GITHUB_ENVIRONMENT_POLICY_MISMATCH",
    ],
    [
      "reviewer policy",
      "environment",
      (f) =>
        f.evidence.environment.body.protection_rules[0].reviewers[0].reviewer
          .id++,
      "GITHUB_ENVIRONMENT_POLICY_MISMATCH",
    ],
    [
      "environment branch policy",
      "environment",
      (f) => (f.evidence.environment.body.deployment_branch_policy = null),
      "GITHUB_ENVIRONMENT_POLICY_MISMATCH",
    ],
    [
      "approver",
      "reviews",
      (f) => f.evidence.reviews.body[0].user.id++,
      "GITHUB_APPROVER_MISMATCH",
    ],
    [
      "review environment",
      "reviews",
      (f) => (f.evidence.reviews.body[0].environments[0].name = "production"),
      "GITHUB_ENVIRONMENT_IDENTITY_MISMATCH",
    ],
    [
      "review request run",
      "reviews",
      (f) => (f.evidence.reviews.request.runId = "790"),
      "GITHUB_REQUEST_BINDING_MISMATCH",
    ],
    [
      "jobs requested attempt",
      "jobs",
      (f) => (f.evidence.jobs[0].request.attempt = 1),
      "GITHUB_REQUEST_BINDING_MISMATCH",
    ],
    [
      "check publisher",
      "checks",
      (f) => f.evidence.checks[0].body.check_runs[0].app.id++,
      "GITHUB_CHECK_PUBLISHER_MISMATCH",
    ],
    [
      "check commit",
      "checks",
      (f) =>
        (f.evidence.checks[0].body.check_runs[0].head_sha = "c".repeat(40)),
      "GITHUB_CHECK_COMMIT_MISMATCH",
    ],
    [
      "failed check",
      "checks",
      (f) => (f.evidence.checks[0].body.check_runs[0].conclusion = "failure"),
      "GITHUB_REQUIRED_CHECK_NOT_SUCCESSFUL",
    ],
    [
      "pending check",
      "checks",
      (f) => (f.evidence.checks[0].body.check_runs[0].status = "in_progress"),
      "GITHUB_REQUIRED_CHECK_NOT_SUCCESSFUL",
    ],
    [
      "future check",
      "checks",
      (f) =>
        (f.evidence.checks[0].body.check_runs[0].completed_at = new Date(
          now + 1,
        ).toISOString()),
      "GITHUB_REQUIRED_CHECK_NOT_SUCCESSFUL",
    ],
    [
      "admin exemptions",
      "requiredCheckConfiguration",
      (f) => (f.evidence.branchProtection.body.enforce_admins.enabled = false),
      "GITHUB_REQUIRED_CHECK_POLICY_MISMATCH",
    ],
  ];
  it.each(mismatches)(
    "denies %s at the intended predicate",
    (_name, predicate, change, code) => {
      const f = fixture();
      expect(evaluate(f).predicates[predicate]).toEqual(matched);
      change(f);
      const result = evaluate(f);
      expect(result.predicates[predicate]).toEqual({ status: "denied", code });
      expectBlocked(result);
    },
  );
  it("does not substitute an old attempt's positive fields for the current attempt", () => {
    const f = fixture();
    f.evidence.attempt.body.run_attempt = 1;
    expect(evaluate(f).predicates.attempt.status).toBe("denied");
    expect(evaluate(f).predicates.run).toEqual(matched);
    expect(evaluate(f).predicates.reviews).toEqual(matched);
    expect(evaluate(f).predicates.approvalAttemptBinding.status).toBe(
      "unsupported",
    );
  });
  it("requires the named trusted check rather than another passing check", () => {
    const f = fixture();
    expect(evaluate(f).predicates.checks).toEqual(matched);
    f.evidence.checks[0].body.check_runs[0].name = "unrelated";
    expect(evaluate(f).predicates.checks.code).toBe(
      "GITHUB_REQUIRED_CHECK_MISSING",
    );
  });
  it.each([-1, null])(
    "does not accept unbound configured publisher %s",
    (appId) => {
      const f = fixture();
      expect(evaluate(f).predicates.requiredCheckConfiguration).toEqual(
        matched,
      );
      f.evidence.branchProtection.body.required_status_checks.checks[0].app_id =
        appId;
      expect(evaluate(f).predicates.requiredCheckConfiguration).toEqual({
        status: "unsupported",
        code: "GITHUB_CHECK_PUBLISHER_UNBOUND",
      });
    },
  );
  it("includes active ruleset requirements in the configured check inventory", () => {
    const f = fixture();
    f.evidence.branchProtection.body.required_status_checks = null;
    f.evidence.rules[0].body = [
      {
        type: "required_status_checks",
        parameters: {
          required_status_checks: [{ context: "quality", integration_id: 13 }],
        },
      },
    ];
    expect(evaluate(f).predicates.requiredCheckConfiguration).toEqual(matched);
    f.evidence.rules[0].body[0].parameters.required_status_checks.push({
      context: "additional",
      integration_id: 13,
    });
    expect(evaluate(f).predicates.requiredCheckConfiguration.code).toBe(
      "GITHUB_REQUIRED_CHECK_POLICY_MISMATCH",
    );
  });
  it("does not silently choose between multiple results from the same publisher", () => {
    const f = fixture();
    const duplicate = structuredClone(f.evidence.checks[0].body.check_runs[0]);
    duplicate.id++;
    f.evidence.checks[0].body.check_runs.push(duplicate);
    f.evidence.checks[0].body.total_count++;
    expect(evaluate(f).predicates.checks.code).toBe(
      "GITHUB_CHECK_RESULT_AMBIGUOUS",
    );
  });
  it.each(["jobs", "checks"])(
    "checks complete %s pagination and duplicate identities",
    (kind) => {
      const f = fixture();
      expect(evaluate(f).predicates[kind]).toEqual(matched);
      f.evidence[kind][0].body.total_count++;
      expect(evaluate(f).predicates[kind].code).toBe(
        "GITHUB_PAGINATION_INCOMPLETE",
      );
      const key = kind === "jobs" ? "jobs" : "check_runs";
      f.evidence[kind][0].body[key].push(
        structuredClone(f.evidence[kind][0].body[key][0]),
      );
      expect(evaluate(f).predicates[kind].code).toBe(
        "GITHUB_PAGINATION_INCOMPLETE",
      );
    },
  );
  it("accepts complete multiple pages, but blocks missing tails and inconsistent totals", () => {
    const f = fixture();
    const first = f.evidence.jobs[0];
    first.body.total_count = 2;
    first.headers.link =
      '<https://api.github.com/repos/elkasaby1996-sys/coachos/actions/runs/789/attempts/2/jobs?page=2>; rel="next"';
    const second = structuredClone(first);
    second.request.page = 2;
    second.headers.link =
      '<https://api.github.com/repos/elkasaby1996-sys/coachos/actions/runs/789/attempts/2/jobs?page=1>; rel="prev"';
    second.body.jobs[0].id = 15;
    f.evidence.jobs.push(second);
    expect(evaluate(f).predicates.jobs).toEqual(matched);
    second.body.total_count = 3;
    expect(evaluate(f).predicates.jobs.code).toBe(
      "GITHUB_PAGINATION_INCOMPLETE",
    );
    f.evidence.jobs.pop();
    expect(evaluate(f).predicates.jobs.code).toBe(
      "GITHUB_PAGINATION_INCOMPLETE",
    );
  });
  it("rejects the mixed-page-size omission of required rule 4", () => {
    const f = fixture();
    const path = `https://api.github.com/repos/${repository}/rules/branches/main`;
    f.evidence.rules = [
      response(
        [{ type: "creation" }, { type: "update" }, { type: "deletion" }],
        { ref: "main", page: 1 },
      ),
      response([{ type: "non_fast_forward" }], { ref: "main", page: 2 }),
    ];
    f.evidence.rules[0].headers.link = `<${path}?page=2&per_page=3>; rel="next", <${path}?page=2&per_page=3>; rel="last"`;
    f.evidence.rules[1].headers.link = `<${path}?page=1&per_page=4>; rel="prev", <${path}?page=1&per_page=4>; rel="first"`;
    const result = evaluate(f);
    expect(result.predicates.rules.code).toBe("GITHUB_PAGINATION_INCOMPLETE");
    expect(result.predicates.requiredCheckConfiguration?.status).not.toBe(
      "matches_documented_fields",
    );
    expectBlocked(result);
  });
  function paginatedRules() {
    const f = fixture();
    const path = `https://api.github.com/repos/${repository}/rules/branches/main`;
    f.evidence.rules = [
      response(
        [{ type: "creation" }, { type: "update" }, { type: "deletion" }],
        { ref: "main", page: 1, perPage: 3 },
      ),
      response([{ type: "non_fast_forward" }], {
        ref: "main",
        page: 2,
        perPage: 3,
      }),
    ];
    f.evidence.rules[0].headers.link = `<${path}?page=2&per_page=3>; rel="next", <${path}?page=2&per_page=3>; rel="last"`;
    f.evidence.rules[1].headers.link = `<${path}?page=1&per_page=3>; rel="prev", <${path}?page=1&per_page=3>; rel="first"`;
    return f;
  }
  it("preserves complete consistent pagination and exposes required rule 4", () => {
    const f = paginatedRules();
    const control = evaluate(f);
    expect(control.predicates.rules).toEqual(matched);
    expect(control.predicates.requiredCheckConfiguration).toEqual(matched);
    expect(control.code).toBe("APPROVAL_EVIDENCE_UNSUPPORTED");
    expectBlocked(control);
    f.evidence.rules[1].body.unshift({
      type: "required_status_checks",
      parameters: {
        required_status_checks: [
          { context: "security-required", integration_id: 13 },
        ],
      },
    });
    const result = evaluate(f);
    expect(result.predicates.rules).toEqual(matched);
    expect(result.predicates.requiredCheckConfiguration.code).toBe(
      "GITHUB_REQUIRED_CHECK_POLICY_MISMATCH",
    );
    expectBlocked(result);
  });
  it.each([
    ["changed page size", { perPage: 4 }],
    ["omitted page size", { perPage: undefined }],
    ["skipped page", { page: 3 }],
    ["duplicate page", { page: 1 }],
    ["changed branch", { ref: "other" }],
    ["changed repository", { repository: "other/repo" }],
    ["added filter", { filter: "all" }],
    ["added attempt", { attempt: 2 }],
  ])("rejects rules request identity: %s", (_label, changes) => {
    const f = paginatedRules();
    expect(evaluate(f).predicates.requiredCheckConfiguration).toEqual(matched);
    Object.assign(f.evidence.rules[1].request, changes);
    if ("perPage" in changes && changes.perPage === undefined)
      delete f.evidence.rules[1].request.perPage;
    const result = evaluate(f);
    expect(result.predicates.rules.code).toBe(
      "repository" in changes
        ? "GITHUB_RESPONSE_INVALID"
        : "GITHUB_REQUEST_BINDING_MISMATCH",
    );
    expect(result.predicates.requiredCheckConfiguration?.status).not.toBe(
      "matches_documented_fields",
    );
    expectBlocked(result);
  });
  it.each([
    "page=1&per_page=4",
    "page=1",
    "page=1&per_page=3&per_page=3",
    "page=1&per_page=3&filter=all",
    "page=1&per_page=3&ref=other",
    "page=2&per_page=3",
    "page=1&per_page=0",
    "page=1&per_page=101",
  ])("rejects contradictory rules Link metadata: %s", (query) => {
    const f = paginatedRules();
    expect(evaluate(f).predicates.requiredCheckConfiguration).toEqual(matched);
    f.evidence.rules[1].headers.link = `<https://api.github.com/repos/${repository}/rules/branches/main?${query}>; rel="prev"`;
    const result = evaluate(f);
    expect(result.predicates.rules.code).toBe("GITHUB_PAGINATION_INCOMPLETE");
    expect(result.predicates.requiredCheckConfiguration?.status).not.toBe(
      "matches_documented_fields",
    );
    expectBlocked(result);
  });
  it("rejects mixed page sizes even when each page agrees with its own Link", () => {
    const f = paginatedRules();
    f.evidence.rules[1].request.perPage = 4;
    f.evidence.rules[1].headers.link =
      f.evidence.rules[1].headers.link.replaceAll("per_page=3", "per_page=4");
    const result = evaluate(f);
    expect(result.predicates.rules.code).toBe(
      "GITHUB_REQUEST_BINDING_MISMATCH",
    );
    expect(result.predicates.requiredCheckConfiguration?.status).not.toBe(
      "matches_documented_fields",
    );
    expectBlocked(result);
  });
  it("requires all rules pages and refuses a claimed complete flag", () => {
    const f = fixture();
    expect(evaluate(f).predicates.rules).toEqual(matched);
    f.evidence.rules[0].headers.link =
      '<https://api.github.com/repos/elkasaby1996-sys/coachos/rules/branches/main?page=2>; rel="next"';
    expect(evaluate(f).predicates.rules.code).toBe(
      "GITHUB_PAGINATION_INCOMPLETE",
    );
    f.evidence.rules[0].complete = true;
    expect(evaluate(f).predicates.rules.code).toBe("GITHUB_RESPONSE_INVALID");
  });
  it.each([
    "not a Link header",
    "<https://api.github.com/repos/elkasaby1996-sys/coachos/rules/branches/main?page=2>; rel=next",
    '<https://example.invalid/rules?page=2>; rel="next"',
    '<https://api.github.com/repos/other/repo/rules/branches/main?page=2>; rel="next"',
    '<https://api.github.com/repos/elkasaby1996-sys/coachos/rules/branches/main?page=3>; rel="next"',
  ])("blocks malformed or substituted pagination link %#", (link) => {
    const f = fixture();
    expect(evaluate(f).predicates.rules).toEqual(matched);
    f.evidence.rules[0].headers.link = link;
    expect(evaluate(f).predicates.rules.code).toBe(
      "GITHUB_PAGINATION_INCOMPLETE",
    );
    expectBlocked(evaluate(f));
  });
  it("supports complete rules pagination without inventing total_count", () => {
    const f = fixture();
    const first = f.evidence.rules[0];
    first.headers.link =
      '<https://api.github.com/repos/elkasaby1996-sys/coachos/rules/branches/main?page=2>; rel="next"';
    const second = response([], { ref: "main", page: 2 });
    f.evidence.rules.push(second);
    expect(evaluate(f).predicates.rules).toEqual(matched);
    expect(evaluate(f).predicates.requiredCheckConfiguration).toEqual(matched);
    second.request.page = 3;
    expect(evaluate(f).predicates.rules.code).toBe(
      "GITHUB_REQUEST_BINDING_MISMATCH",
    );
  });
  it.each(["jobs", "checks", "rules"])(
    "blocks stale and failed later %s pages",
    (kind) => {
      const f = fixture();
      const first = f.evidence[kind][0];
      const suffix =
        kind === "jobs"
          ? "actions/runs/789/attempts/2/jobs"
          : kind === "checks"
            ? `commits/${commit}/check-runs`
            : "rules/branches/main";
      first.headers.link = `<https://api.github.com/repos/${repository}/${suffix}?page=2${kind === "checks" ? "&filter=all" : ""}>; rel="next"`;
      const second = structuredClone(first);
      second.request.page = 2;
      second.headers.link = null;
      if (kind !== "rules") {
        const key = kind === "jobs" ? "jobs" : "check_runs";
        first.body.total_count = second.body.total_count = 2;
        second.body[key][0].id = 999;
        if (kind === "checks") second.body[key][0].name = "other";
      }
      f.evidence[kind].push(second);
      expect(evaluate(f).predicates[kind]).toEqual(matched);
      second.observedAt = new Date(
        now - GITHUB_EVIDENCE_MAX_AGE_MS - 1,
      ).toISOString();
      expect(evaluate(f).predicates[kind].code).toBe("GITHUB_EVIDENCE_STALE");
      second.observedAt = observedAt;
      second.status = 429;
      expect(evaluate(f).predicates[kind].code).toBe("GITHUB_RATE_LIMITED");
    },
  );
  it.each([
    undefined,
    {},
    [],
    { id: "123" },
    { id: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects missing or unsupported repository shape %#", (body) => {
    const f = fixture();
    if (body === undefined) delete f.evidence.repository;
    else f.evidence.repository.body = body;
    expect(evaluate(f).predicates.repository.status).toBe("unsupported");
    expectBlocked(evaluate(f));
  });
  it.each([
    [500, null, null, "GITHUB_API_ERROR"],
    [404, null, null, "GITHUB_API_ERROR"],
    [403, "0", null, "GITHUB_RATE_LIMITED"],
    [429, null, null, "GITHUB_RATE_LIMITED"],
    [null, null, "timeout", "GITHUB_TIMEOUT"],
    [null, null, "network", "GITHUB_NETWORK_ERROR"],
  ])(
    "classifies acquisition failure %# without exposing raw errors",
    (status, remaining, error, code) => {
      const f = fixture();
      const r = f.evidence.repository;
      r.status = status;
      r.headers.rateLimitRemaining = remaining;
      r.transportError = error;
      r.body = { message: "PRIVATE_SENTINEL" };
      const result = evaluate(f);
      expect(result.predicates.repository).toEqual({
        status: "unsupported",
        code,
      });
      expect(JSON.stringify(result)).not.toContain("PRIVATE_SENTINEL");
      expectBlocked(result);
    },
  );
  it.each([-GITHUB_EVIDENCE_MAX_AGE_MS, -GITHUB_EVIDENCE_MAX_AGE_MS - 1, 1])(
    "enforces evidence freshness offset %s",
    (offset) => {
      const f = fixture();
      f.evidence.repository.observedAt = new Date(now + offset).toISOString();
      expect(evaluate(f).predicates.repository).toEqual(
        offset === -GITHUB_EVIDENCE_MAX_AGE_MS
          ? matched
          : { status: "unsupported", code: "GITHUB_EVIDENCE_STALE" },
      );
    },
  );
  it("rejects filtered check acquisition instead of assuming complete required checks", () => {
    const f = fixture();
    delete f.evidence.checks[0].request.filter;
    expect(evaluate(f).predicates.checks.code).toBe(
      "GITHUB_REQUEST_BINDING_MISMATCH",
    );
  });
  it("does not let a caller supplied authentication flag confer authority", () => {
    const f = fixture();
    f.evidence.repository.authenticated = true;
    expect(evaluate(f).predicates.repository.code).toBe(
      "GITHUB_RESPONSE_INVALID",
    );
    expectBlocked(evaluate(f));
  });
  it("is pure and performs no transport or mutation calls", () => {
    const f = fixture();
    const original = structuredClone(f);
    const network = vi.spyOn(globalThis, "fetch");
    expectBlocked(evaluate(f));
    expect(network).not.toHaveBeenCalled();
    expect(f).toEqual(original);
    network.mockRestore();
  });
  it("rejects unknown evidence input and invalid expectations without echoing them", () => {
    const f = fixture();
    f.evidence.authorized = true;
    expect(evaluate(f).code).toBe("APPROVAL_EVIDENCE_UNSUPPORTED");
    expect(evaluate(f).predicates.input.code).toBe("GITHUB_EVIDENCE_INVALID");
    delete f.evidence.authorized;
    f.expected.repositoryId = "PRIVATE_SENTINEL";
    expect(evaluate(f).predicates.expectations.code).toBe(
      "GITHUB_EXPECTATIONS_INVALID",
    );
    expect(JSON.stringify(evaluate(f))).not.toContain("PRIVATE_SENTINEL");
  });
});

describe("supplementary deployment and OIDC fields never establish approval", () => {
  function supplementary(): any {
    const f = fixture();
    f.evidence.deployment = response({
      id: 16,
      sha: commit,
      ref: "main",
      environment: "supabase-staging",
    });
    f.evidence.deploymentReviewWebhook = {
      observedAt,
      payload: {
        action: "approved",
        approver: { id: 42 },
        repository: structuredClone(repo),
        since: observedAt,
        workflow_run: null,
      },
    };
    f.evidence.oidc = {
      observedAt,
      claims: {
        iss: "https://token.actions.githubusercontent.com",
        aud: f.expected.oidcAudience,
        sub: f.expected.oidcSubject,
        repository,
        repository_id: "123",
        repository_owner_id: "456",
        actor_id: "42",
        run_id: "789",
        run_attempt: "2",
        sha: commit,
        ref: "refs/heads/main",
        event_name: "workflow_dispatch",
        workflow_ref: `${repository}/${f.expected.workflowPath}@refs/heads/main`,
        workflow_sha: commit,
        environment: "supabase-staging",
        exp: now / 1000 + 60,
        iat: now / 1000,
        nbf: now / 1000,
        jti: "synthetic-jwt-id",
      },
    };
    return f;
  }
  function associatedWebhook(): any {
    const f = supplementary();
    const p = f.evidence.deploymentReviewWebhook.payload;
    p.workflow_run = structuredClone(f.evidence.attempt.body);
    p.workflow_job_run = {
      id: 11,
      environment: "supabase-staging",
      status: "waiting",
    };
    return f;
  }
  it.each(["workflow_job_run", "workflow_job_runs"])(
    "compares documented webhook run/attempt and %s fields without granting authority",
    (field) => {
      const f = associatedWebhook();
      const p = f.evidence.deploymentReviewWebhook.payload;
      if (field === "workflow_job_runs") {
        p.workflow_job_runs = [p.workflow_job_run];
        delete p.workflow_job_run;
      }
      const result = evaluate(f);
      expect(result.predicates.webhookRunAttempt).toEqual(matched);
      expect(result.predicates.webhookJobEnvironment).toEqual(matched);
      expect(result.predicates.approvalAttemptBinding.status).toBe(
        "unsupported",
      );
      expect(result.predicates.noAdministrativeBypass.status).toBe(
        "unsupported",
      );
      expectBlocked(result);
    },
  );
  it.each([
    "id",
    "run_attempt",
    "workflow_id",
    "head_sha",
    "actor",
    "triggering_actor",
  ])("rejects conflicting webhook run %s", (field) => {
    const f = associatedWebhook();
    expect(evaluate(f).predicates.webhookRunAttempt).toEqual(matched);
    const r = f.evidence.deploymentReviewWebhook.payload.workflow_run;
    if (field === "head_sha") r.head_sha = "c".repeat(40);
    else if (field === "actor" || field === "triggering_actor") r[field].id++;
    else r[field]++;
    expect(evaluate(f).predicates.webhookRunAttempt).toEqual({
      status: "denied",
      code: "GITHUB_WEBHOOK_RUN_ATTEMPT_MISMATCH",
    });
  });
  it.each(["id", "environment"])(
    "rejects conflicting webhook job %s",
    (field) => {
      const f = associatedWebhook();
      expect(evaluate(f).predicates.webhookJobEnvironment).toEqual(matched);
      f.evidence.deploymentReviewWebhook.payload.workflow_job_run[field] =
        field === "id" ? 999 : "production";
      expect(evaluate(f).predicates.webhookJobEnvironment).toEqual({
        status: "denied",
        code: "GITHUB_WEBHOOK_JOB_ENVIRONMENT_MISMATCH",
      });
    },
  );
  it("does not guess between singular/plural or duplicated webhook job associations", () => {
    const f = associatedWebhook();
    const p = f.evidence.deploymentReviewWebhook.payload;
    expect(evaluate(f).predicates.webhookJobEnvironment).toEqual(matched);
    p.workflow_job_runs = [p.workflow_job_run];
    expect(evaluate(f).predicates.webhookJobEnvironment.code).toBe(
      "GITHUB_WEBHOOK_JOB_ASSOCIATION_AMBIGUOUS",
    );
    delete p.workflow_job_run;
    p.workflow_job_runs.push(structuredClone(p.workflow_job_runs[0]));
    expect(evaluate(f).predicates.webhookJobEnvironment.code).toBe(
      "GITHUB_WEBHOOK_JOB_ASSOCIATION_AMBIGUOUS",
    );
  });
  it("does not repair absent webhook associations with approved review history", () => {
    const f = supplementary();
    expect(evaluate(f).predicates.reviews).toEqual(matched);
    expect(evaluate(f).predicates.webhookRunAttempt.status).toBe("unsupported");
    expect(evaluate(f).predicates.webhookJobEnvironment.status).toBe(
      "unsupported",
    );
    expectBlocked(evaluate(f));
  });
  it("keeps explicit webhook rejection distinct from unsupported evidence", () => {
    const f = associatedWebhook();
    expect(evaluate(f).predicates.deploymentReviewWebhook).toEqual(matched);
    f.evidence.deploymentReviewWebhook.payload.action = "rejected";
    expect(evaluate(f).predicates.deploymentReviewWebhook).toEqual({
      status: "denied",
      code: "GITHUB_ENVIRONMENT_REVIEW_REJECTED",
    });
    expect(evaluate(f).status).toBe("denied");
    expectBlocked(evaluate(f));
    f.evidence.deploymentReviewWebhook.payload.since = "2099-01-01T00:00:00Z";
    expect(evaluate(f).predicates.deploymentReviewWebhook.code).toBe(
      "GITHUB_ENVIRONMENT_REVIEW_REJECTED",
    );
    expect(evaluate(f).status).toBe("denied");
  });
  it("recognizes only documented supplementary fields and leaves authentication unsupported", () => {
    const result = evaluate(supplementary());
    for (const field of ["deployment", "deploymentReviewWebhook", "oidc"])
      expect(result.predicates[field]).toEqual(matched);
    expect(result.predicates.webhookAuthenticityAndAttempt.status).toBe(
      "unsupported",
    );
    expect(result.predicates.oidcAuthenticity.status).toBe("unsupported");
    expect(result.predicates.deploymentApproval.status).toBe("unsupported");
    expectBlocked(result);
  });
  it.each([
    "repository_id",
    "repository_owner_id",
    "actor_id",
    "run_id",
    "run_attempt",
    "sha",
    "workflow_sha",
    "workflow_ref",
    "aud",
    "sub",
    "environment",
  ])("rejects conflicting OIDC %s", (field) => {
    const f = supplementary();
    expect(evaluate(f).predicates.oidc).toEqual(matched);
    f.evidence.oidc.claims[field] = ["sha", "workflow_sha"].includes(field)
      ? "c".repeat(40)
      : field.endsWith("_id") || field === "run_attempt"
        ? "999"
        : "other";
    expect(evaluate(f).predicates.oidc).toEqual({
      status: "denied",
      code: "GITHUB_OIDC_BINDING_OR_EXPIRY_MISMATCH",
    });
  });
  it("rejects expired OIDC claims at the exact expiry boundary", () => {
    const f = supplementary();
    f.evidence.oidc.claims.exp = now / 1000;
    expect(evaluate(f).predicates.oidc.code).toBe(
      "GITHUB_OIDC_BINDING_OR_EXPIRY_MISMATCH",
    );
  });
  it("a deployment creator is never treated as an environment approver", () => {
    const f = supplementary();
    f.evidence.deployment.body.creator = user(42);
    f.evidence.reviews.body = [];
    expect(evaluate(f).predicates.reviews.code).toBe(
      "GITHUB_ENVIRONMENT_APPROVAL_MISSING",
    );
    expectBlocked(evaluate(f));
  });
  it("a webhook does not repair wrong-run review history or prove bypass absence", () => {
    const f = supplementary();
    f.evidence.reviews.request.runId = "790";
    expect(evaluate(f).predicates.reviews.code).toBe(
      "GITHUB_REQUEST_BINDING_MISMATCH",
    );
    expect(evaluate(f).predicates.webhookAuthenticityAndAttempt.status).toBe(
      "unsupported",
    );
    expect(evaluate(f).predicates.noAdministrativeBypass.status).toBe(
      "unsupported",
    );
  });
});
