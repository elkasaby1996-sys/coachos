import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertReplacementTarget,
  replacementPolicy,
} from "../../scripts/staging-replacement-target.mjs";

const archivedProject = "dgogugyuyfourdttvwuy";
const archivedOrigin = "https://repsync-staging.netlify.app";
const productionProject = "btrfmxjpjzbyowtvncnc";
const productionOrigin = "https://repsync-production.netlify.app";
const replacementProject = "exmrksgdikfprtfeltzu";
const replacementOrigin = "https://repsync-staging-replacement.netlify.app";
const otherProject = "a".repeat(20);
const otherOrigin = "https://other-staging.netlify.app";

afterEach(() => vi.unstubAllEnvs());

describe("reviewed replacement target registry", () => {
  it("records the exact identities and preserves the historical review pins", () => {
    expect(replacementPolicy()).toEqual({
      schemaVersion: 3,
      reviewedSource: "d08a4ecd153da3425f8b09a3a315360a5ee23b06",
      reviewedTree: "005a7c096d7476c980dcbde4a0b6d703757c6643",
      archivedProjects: [archivedProject],
      archivedOrigins: [archivedOrigin],
      productionProject,
      productionOrigin,
      replacement: { project: replacementProject, origin: replacementOrigin },
    });
  });

  it.each([false, true])("accepts the exact pair, required=%s", (required) => {
    expect(
      assertReplacementTarget(
        replacementProject,
        replacementOrigin,
        replacementPolicy(),
        required,
      ),
    ).toEqual(replacementPolicy());
  });

  const origins = [
    undefined,
    null,
    replacementOrigin,
    archivedOrigin,
    productionOrigin,
    otherOrigin,
    "not-an-origin",
  ];
  it.each(
    [archivedProject, productionProject].flatMap((project) =>
      origins.map((origin) => ({ project, origin })),
    ),
  )("denies protected project for every origin %#", ({ project, origin }) => {
    expect(() => assertReplacementTarget(project, origin)).toThrow(
      "REPLACEMENT_TARGET_DENIED",
    );
  });

  it.each(
    [archivedOrigin, productionOrigin].flatMap((origin) =>
      [
        replacementProject,
        otherProject,
        archivedProject,
        productionProject,
      ].map((project) => ({ project, origin })),
    ),
  )("denies protected origin for every project %#", ({ project, origin }) => {
    expect(() => assertReplacementTarget(project, origin)).toThrow(
      "REPLACEMENT_TARGET_DENIED",
    );
  });

  it.each([
    [replacementProject, otherOrigin],
    [otherProject, replacementOrigin],
    [otherProject, otherOrigin],
    [replacementProject, undefined],
  ])("rejects a missing or crossed pair %#", (project, origin) => {
    expect(() => assertReplacementTarget(project, origin)).toThrow(
      "REPLACEMENT_TARGET_MISMATCH",
    );
  });

  const malformedOrigins = [
    "http://repsync-staging-replacement.netlify.app",
    `${replacementOrigin}/`,
    `${replacementOrigin}/path`,
    `${replacementOrigin}?query=1`,
    `${replacementOrigin}#fragment`,
    "https://user:password@repsync-staging-replacement.netlify.app",
    "https://repsync-staging-replacement.netlify.app:443",
    "https://repsync-staging-replacement.netlify.app:8443",
    "https://REPSYNC-STAGING-REPLACEMENT.netlify.app",
    ` ${replacementOrigin}`,
    "https://repsync-replacement.netlify.app",
    "https://repsync-staging-production.netlify.app",
    "https://repsync-staging-prod.netlify.app",
    "https://staging.localhost",
    "https://staging.internal",
    "https://staging.test",
    "https://staging.invalid",
  ];
  it.each(malformedOrigins)("rejects malformed input origin %#", (origin) => {
    expect(() => assertReplacementTarget(replacementProject, origin)).toThrow(
      "REPLACEMENT_TARGET_MISMATCH",
    );
  });
  it.each(malformedOrigins)(
    "rejects malformed configured origin %#",
    (origin) => {
      expect(() =>
        assertReplacementTarget(replacementProject, origin, {
          ...replacementPolicy(),
          replacement: { project: replacementProject, origin },
        }),
      ).toThrow("REPLACEMENT_POLICY_INVALID");
    },
  );

  it.each(["archivedOrigins", "productionOrigin", "replacement"])(
    "rejects a missing policy field: %s",
    (field) => {
      const policy = replacementPolicy();
      delete policy[field];
      expect(() =>
        assertReplacementTarget(
          replacementProject,
          replacementOrigin,
          policy,
          true,
        ),
      ).toThrow("REPLACEMENT_POLICY_INVALID");
    },
  );
  it.each([
    ["archivedOrigins", "ARCHIVED_ORIGINS_REVIEW_REQUIRED"],
    ["productionOrigin", "PRODUCTION_ORIGIN_REVIEW_REQUIRED"],
    ["replacement", "REPLACEMENT_NOT_CONFIGURED"],
  ])("rejects required null configuration: %s", (field, error) => {
    expect(() =>
      assertReplacementTarget(
        replacementProject,
        replacementOrigin,
        { ...replacementPolicy(), [field]: null },
        true,
      ),
    ).toThrow(error);
  });

  it.each(["reviewedSource", "reviewedTree"])(
    "rejects drift in the historical pin: %s",
    (field) => {
      expect(() =>
        assertReplacementTarget(replacementProject, replacementOrigin, {
          ...replacementPolicy(),
          [field]: "f".repeat(40),
        }),
      ).toThrow("REPLACEMENT_POLICY_INVALID");
    },
  );

  it("cannot override the registry using environment variables", () => {
    const policy = replacementPolicy();
    for (const name of [
      "SUPABASE_PROJECT_REF",
      "STAGING_SUPABASE_PROJECT_REF",
      "CONFIRM_PROJECT_REF",
    ])
      vi.stubEnv(name, otherProject);
    for (const name of ["STAGING_APPLICATION_ORIGIN", "CONFIRM_APP_ORIGIN"])
      vi.stubEnv(name, otherOrigin);
    vi.stubEnv("PRODUCTION_SUPABASE_PROJECT_REF", otherProject);
    vi.stubEnv("PRODUCTION_APPLICATION_ORIGIN", otherOrigin);
    expect(replacementPolicy()).toEqual(policy);
    expect(() =>
      assertReplacementTarget(replacementProject, replacementOrigin),
    ).not.toThrow();
    expect(() => assertReplacementTarget(otherProject, otherOrigin)).toThrow(
      "REPLACEMENT_TARGET_MISMATCH",
    );
    expect(() => assertReplacementTarget(archivedProject, otherOrigin)).toThrow(
      "REPLACEMENT_TARGET_DENIED",
    );
    expect(() =>
      assertReplacementTarget(otherProject, productionOrigin),
    ).toThrow("REPLACEMENT_TARGET_DENIED");
  });
});
