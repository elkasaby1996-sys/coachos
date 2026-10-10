import { describe, it, expect, vi } from "vitest";
import { captureBaselineCandidate } from "../../scripts/staging-bootstrap-capture.mjs";
import { validateVirginBaseline } from "../../scripts/staging-bootstrap-baseline.mjs";
import { replacementPolicy } from "../../scripts/staging-replacement-target.mjs";
import { retrospectiveBaselineFixture } from "../helpers/staging-timing-fixture";
import { founderFixture } from "../helpers/staging-founder-fixture";
import {
  captureFixture,
  captureClock,
} from "../helpers/staging-capture-fixture";
import {
  BOOTSTRAP_CATALOG_QUERY,
  bootstrapDatabaseProfiles,
} from "../../scripts/staging-bootstrap-database.mjs";
import {
  createBootstrapObserver,
  BOOTSTRAP_RESPONSE_MAX_BYTES,
  BOOTSTRAP_OBSERVATION_MAX_BYTES,
} from "../../scripts/staging-bootstrap-observation.mjs";

// Real Response streams, with no automatic prefetch. Padding is legal JSON
// whitespace so a size rejection cannot be confused with a semantic failure.
function paddedResponse(json: string, size: number, headers?: HeadersInit) {
  const prefix = new TextEncoder().encode(json);
  expect(size).toBeGreaterThanOrEqual(prefix.byteLength);
  let sent = 0;
  const cancel = vi.fn();
  const pull = vi.fn((controller: ReadableStreamDefaultController) => {
    if (sent === size) {
      controller.close();
      return;
    }
    if (sent === 0) {
      controller.enqueue(prefix);
      sent += prefix.byteLength;
    } else {
      const chunk = new Uint8Array(Math.min(64 * 1024, size - sent)).fill(32);
      controller.enqueue(chunk);
      sent += chunk.byteLength;
    }
  });
  const response = new Response(
    new ReadableStream({ pull, cancel }, { highWaterMark: 0 }),
    { headers },
  );
  const jsonRead = vi.spyOn(response, "json");
  return { response, cancel, pull, jsonRead, sent: () => sent };
}

describe("first-capture unsigned evidence", () => {
  it("captures an unsigned founder candidate only with scoped capture action authority", async () => {
    const h = captureFixture();
    const f = founderFixture(h.options.context, captureClock);
    const input: any = {
      phase: "CAPTURE_BASELINE",
      mode: "preflight",
      identity: h.identity,
      context: f.context,
      contracts: {},
      authorization: {
        operator: h.options.operator,
        expiresAt: h.options.expiresAt,
      },
    };
    input.authorization.operator.operatorIdentity = f.policy.founder.subject;
    const action = f.action(input);
    const result = await captureBaselineCandidate(
      {
        ...h.options,
        context: f.context,
        actionEnvelope: action,
        workflow: input.workflow,
      },
      { ...h.dependencies, ...f.deps },
    );
    expect(result).toMatchObject({
      status: "CANDIDATE_REQUIRES_FOUNDER_REVIEW",
      operational: false,
    });
    expect(result.candidate.schemaVersion).toBe(3);
    expect(result.candidate.review).toBeUndefined();
    expect(result.candidate.governance).toBeUndefined();
    expect(h.reads()).toBe(6);
  });
  it.each(["creation", "retrospective"])(
    "collects three independent complete observations: %s",
    async (mode) => {
      const h = captureFixture();
      if (mode === "retrospective")
        h.options.operator = retrospectiveBaselineFixture(h.baseline).creation;
      const result = await captureBaselineCandidate(h.options, h.dependencies);
      expect(result.status).toBe("CANDIDATE_REQUIRES_INDEPENDENT_REVIEW");
      expect(result.operational).toBe(false);
      expect(result.summary).toEqual({
        observations: 3,
        databaseReads: 6,
        operational: false,
      });
      expect(h.reads()).toBe(6);
      expect(h.dependencies.assertSource).toHaveBeenCalledTimes(5);
      expect(result.candidate.source.sha).toBe(h.options.context.commit);
      expect(result.candidate.target).toEqual({
        project: h.options.context.project,
        organization: h.options.context.organization,
        origin: h.options.context.origin,
      });
      expect(result.candidate.capture.opening).not.toBe(
        result.candidate.capture.closing,
      );
      expect(result.candidate.capture.confirmation).not.toBe(
        result.candidate.capture.closing,
      );
      expect(result.candidate).not.toHaveProperty("review");
      expect(result.candidate).not.toHaveProperty("historyReview");
      expect(result.candidate.creation.captureExclusion).toEqual(
        h.options.operator.captureExclusion,
      );
      expect(() =>
        validateVirginBaseline(
          result.candidate,
          h.identity,
          h.options.context,
          replacementPolicy(),
          h.time,
        ),
      ).toThrow("BOOTSTRAP_BASELINE_INVALID");
      expect(h.mutation).not.toHaveBeenCalled();
    },
  );
  it.each([
    "clientsExcluded",
    "providerIngressExcluded",
    "manualWritersExcluded",
    "backgroundWritersExcluded",
  ])("does not synthesize %s", async (key) => {
    const h = captureFixture();
    (h.options.operator.captureExclusion as any)[key] = false;
    expect(await captureBaselineCandidate(h.options, h.dependencies)).toEqual({
      status: "EVIDENCE_INCOMPLETE",
      operational: false,
    });
    expect(h.transport).not.toHaveBeenCalled();
  });
  it.each([
    "noManagedSchemaCustomizationSinceProjectCreation",
    "noRestoreOrImport",
    "operatorIdentity",
    "history",
    "provenanceEvidenceSha256",
  ])("missing %s is incomplete before reads", async (key) => {
    const h = captureFixture();
    delete (h.options.operator as any)[key];
    expect(
      (await captureBaselineCandidate(h.options, h.dependencies)).status,
    ).toBe("EVIDENCE_INCOMPLETE");
    expect(h.transport).not.toHaveBeenCalled();
  });
  it("rejects known customization before transport", async () => {
    const h = captureFixture();
    h.options.operator.knownCustomerCustomizations = ["custom storage index"];
    expect(
      (await captureBaselineCandidate(h.options, h.dependencies)).status,
    ).toBe("EVIDENCE_INCOMPLETE");
    expect(h.transport).not.toHaveBeenCalled();
  });
  it.each([
    [
      "expired exclusion",
      (h: any) =>
        (h.options.operator.captureExclusion.quietWindowEndsAt =
          h.options.expiresAt),
      "BOOTSTRAP_BASELINE_CAPTURE_EXCLUSION_INVALID",
    ],
    [
      "production",
      (h: any) =>
        (h.options.context.project = h.options.context.productionProject),
      "REPLACEMENT_TARGET_DENIED",
    ],
    [
      "archived",
      (h: any) => (h.options.context.project = "dgogugyuyfourdttvwuy"),
      "REPLACEMENT_TARGET_DENIED",
    ],
    [
      "wrong org",
      (h: any) => (h.options.context.organization = "wrong"),
      "BOOTSTRAP_CAPTURE_TARGET_BINDING",
    ],
    [
      "wrong origin",
      (h: any) => (h.options.context.origin = "https://wrong.example"),
      "REPLACEMENT_TARGET_MISMATCH",
    ],
  ])("rejects %s before reads", async (_, change: any, category) => {
    const h = captureFixture();
    change(h);
    await expect(
      captureBaselineCandidate(h.options, h.dependencies),
    ).rejects.toThrow(category);
    expect(h.transport).not.toHaveBeenCalled();
    expect(h.mutation).not.toHaveBeenCalled();
  });
  it.each([
    [
      "missing Auth",
      (h: any) => delete h.state.auth.site_url,
      "RELEASE_AUTH_CONFIGURATION_INVALID",
    ],
    [
      "missing secret hash",
      (h: any) => delete h.state.secrets[0].value,
      "RELEASE_SECRET_INVENTORY_INVALID",
    ],
    [
      "missing SSO",
      (h: any) => (h.state.sso = {}),
      "BOOTSTRAP_CUSTOMER_AUTH_INTEGRATIONS",
    ],
    [
      "missing third-party",
      (h: any) => (h.state.integrations = null),
      "BOOTSTRAP_CUSTOMER_AUTH_INTEGRATIONS",
    ],
    [
      "enabled Auth hook",
      (h: any) =>
        (h.state.auth[bootstrapDatabaseProfiles().authBooleanFields[0]] = true),
      "BOOTSTRAP_CUSTOMER_AUTH_CONFIGURATION",
    ],
    [
      "incomplete extraction",
      (h: any) => (h.state.facts.databaseProof.platformComplete = false),
      "BOOTSTRAP_PLATFORM_PROOF_INCOMPLETE",
    ],
    [
      "permission filtering",
      (h: any) => (h.state.facts.databaseProof.platform[0].unfiltered = false),
      "BOOTSTRAP_EXTRACTION_INCOMPLETE",
    ],
    [
      "unsafe ACL",
      (h: any) =>
        (h.state.facts.databaseProof.customerSecurity[0][2] = ["unsafe"]),
      "BOOTSTRAP_CUSTOMER_SECURITY_MISMATCH",
    ],
    [
      "application object",
      (h: any) => (h.state.facts.applicationRelations = 1),
      "BOOTSTRAP_BASELINE_CUSTOMER_STATE",
    ],
    [
      "functions",
      (h: any) =>
        (h.state.functions = [
          { slug: "unexpected", status: "ACTIVE", version: 1 },
        ]),
      "RETIREMENT_FUNCTION_INVENTORY_INVALID",
    ],
    [
      "wrong observed project",
      (h: any) => (h.state.project.id = "x".repeat(20)),
      "BOOTSTRAP_PROJECT_NOT_HEALTHY",
    ],
  ])("rejects %s through intended gate", async (_, change: any, category) => {
    const h = captureFixture();
    change(h);
    await expect(
      captureBaselineCandidate(h.options, h.dependencies),
    ).rejects.toThrow(category);
    expect(h.mutation).not.toHaveBeenCalled();
  });
  it.each([3, 5, 6])(
    "rejects drift at actual database read %s",
    async (read) => {
      const h = captureFixture();
      let changed = false;
      h.before = (_, n) => {
        if (n === read && !changed) {
          changed = true;
          h.state.facts.databaseProof.catalog.push([
            "index",
            "storage.hidden_index",
            ["UNIQUE"],
          ]);
          h.state.facts.databaseProof.catalogCount++;
          delete h.state.facts.databaseProof.catalogDigest;
        }
      };
      await expect(
        captureBaselineCandidate(h.options, h.dependencies),
      ).rejects.toThrow(/DATABASE_DRIFT|BOOTSTRAP_BASELINE_DATABASE_BINDING/);
      expect(h.reads()).toBe(read === 6 ? 6 : read + 1);
      expect(h.mutation).not.toHaveBeenCalled();
    },
  );
  it("rejects final-only metadata drift and does not retry", async () => {
    const h = captureFixture();
    h.before = (suffix, n) => {
      if (n === 5 && suffix === "/secrets")
        h.state.secrets[0].value = "e".repeat(64);
    };
    await expect(
      captureBaselineCandidate(h.options, h.dependencies),
    ).rejects.toThrow("BOOTSTRAP_BASELINE_CAPTURE_DRIFT");
    expect(h.reads()).toBe(6);
  });
  it("includes validation and all requests in the original 60-second clock", async () => {
    const h = captureFixture();
    h.before = () => {
      h.time = captureClock + 60_001;
    };
    await expect(
      captureBaselineCandidate(h.options, h.dependencies),
    ).rejects.toThrow("BOOTSTRAP_READ_FAILED");
    expect(h.transport).toHaveBeenCalledTimes(1);
  });
  it("sanitizes a read failure without falling back or retrying", async () => {
    const h = captureFixture();
    h.transport.mockRejectedValueOnce(Error("PRIVATE_TOKEN"));
    await expect(
      captureBaselineCandidate(h.options, h.dependencies),
    ).rejects.toThrow("BOOTSTRAP_READ_FAILED");
    expect(h.transport).toHaveBeenCalledTimes(1);
  });
  it("fails source drift before any requests", async () => {
    const h = captureFixture();
    h.dependencies.assertSource.mockImplementation(() => {
      throw Error("BOOTSTRAP_CAPTURE_SOURCE_DRIFT");
    });
    await expect(
      captureBaselineCandidate(h.options, h.dependencies),
    ).rejects.toThrow("BOOTSTRAP_CAPTURE_SOURCE_DRIFT");
    expect(h.transport).not.toHaveBeenCalled();
  });
  it("requests only the existing fixed catalog contract", async () => {
    const h = captureFixture();
    await captureBaselineCandidate(h.options, h.dependencies);
    const catalog = h.transport.mock.calls.filter(
      ([, init]) =>
        init.body && JSON.parse(init.body).query === BOOTSTRAP_CATALOG_QUERY,
    );
    expect(catalog).toHaveLength(6);
  });
  it.each([
    "noUnreviewedCustomerModification",
    "customerModificationHistoryKnown",
    "historicalAccess",
    "operatorAuthenticationEvidenceSha256",
    "knownConfigurationChanges",
  ])("requires retrospective %s explicitly", async (key) => {
    const h = captureFixture();
    h.options.operator = retrospectiveBaselineFixture(h.baseline).creation;
    delete (h.options.operator.history as any)[key];
    expect(
      (await captureBaselineCandidate(h.options, h.dependencies)).status,
    ).toBe("EVIDENCE_INCOMPLETE");
    expect(h.transport).not.toHaveBeenCalled();
  });
  it("returns incomplete when explicit expiry is absent", async () => {
    const h = captureFixture();
    delete (h.options as any).expiresAt;
    expect(
      (await captureBaselineCandidate(h.options, h.dependencies)).status,
    ).toBe("EVIDENCE_INCOMPLETE");
    expect(h.transport).not.toHaveBeenCalled();
  });
  it("unsigned capture cannot unlock the normal operational observer", async () => {
    const h = captureFixture();
    const result = await captureBaselineCandidate(h.options, h.dependencies);
    h.transport.mockClear();
    const observer = createBootstrapObserver(
      h.options.context,
      h.options.env,
      h.transport,
      { baseline: result.candidate, identity: h.identity, now: () => h.time },
    );
    await expect(observer.observe()).rejects.toThrow(
      "BOOTSTRAP_BASELINE_INVALID",
    );
    expect(h.transport).not.toHaveBeenCalled();
    expect(h.mutation).not.toHaveBeenCalled();
  });
  it("permission denial stops without a fallback query", async () => {
    const h = captureFixture();
    h.transport.mockResolvedValueOnce({
      ok: false,
      json: async () => [],
    } as any);
    await expect(
      captureBaselineCandidate(h.options, h.dependencies),
    ).rejects.toThrow("BOOTSTRAP_READ_FAILED");
    expect(h.transport).toHaveBeenCalledTimes(1);
  });
  it("the default execution-source guard blocks a dirty/fake source before transport", async () => {
    const h = captureFixture();
    delete h.dependencies.assertSource;
    await expect(
      captureBaselineCandidate(h.options, h.dependencies),
    ).rejects.toThrow("BOOTSTRAP_CAPTURE_SOURCE_DRIFT");
    expect(h.transport).not.toHaveBeenCalled();
  });
});

describe("bounded first-capture response streams", () => {
  it.each([undefined, "1"])(
    "rejects actual overflow with Content-Length %s and stops before another request",
    async (length) => {
      const h = captureFixture();
      const body = paddedResponse(
        JSON.stringify([{ facts: h.state.facts }]),
        BOOTSTRAP_RESPONSE_MAX_BYTES + 1,
        length === undefined ? undefined : { "content-length": length },
      );
      h.transport.mockResolvedValueOnce(body.response);
      await expect(
        captureBaselineCandidate(h.options, h.dependencies),
      ).rejects.toThrow("BOOTSTRAP_READ_FAILED");
      expect(h.transport).toHaveBeenCalledTimes(1);
      expect(body.cancel).toHaveBeenCalledTimes(1);
      expect(body.response.body?.locked).toBe(false);
      expect(body.jsonRead).not.toHaveBeenCalled();
    },
  );

  it.each(["oversized", "invalid"])(
    "rejects %s declared length before reading the body",
    async (kind) => {
      const h = captureFixture();
      const body = paddedResponse("[]", 2, {
        "content-length":
          kind === "oversized"
            ? String(BOOTSTRAP_RESPONSE_MAX_BYTES + 1)
            : "not-a-length",
      });
      h.transport.mockResolvedValueOnce(body.response);
      await expect(
        captureBaselineCandidate(h.options, h.dependencies),
      ).rejects.toThrow("BOOTSTRAP_READ_FAILED");
      expect(body.pull).not.toHaveBeenCalled();
      expect(body.cancel).toHaveBeenCalledTimes(1);
      expect(body.response.body?.locked).toBe(false);
      expect(h.transport).toHaveBeenCalledTimes(1);
    },
  );

  it("accepts a valid response exactly at the byte ceiling", async () => {
    const h = captureFixture();
    const body = paddedResponse(
      JSON.stringify([{ facts: h.state.facts }]),
      BOOTSTRAP_RESPONSE_MAX_BYTES,
      { "content-length": String(BOOTSTRAP_RESPONSE_MAX_BYTES) },
    );
    h.transport.mockResolvedValueOnce(body.response);
    expect(
      (await captureBaselineCandidate(h.options, h.dependencies)).operational,
    ).toBe(false);
    expect(h.reads()).toBe(6);
    expect(body.sent()).toBe(BOOTSTRAP_RESPONSE_MAX_BYTES);
    expect(body.cancel).not.toHaveBeenCalled();
    expect(body.response.body?.locked).toBe(false);
    expect(body.jsonRead).not.toHaveBeenCalled();
  });

  it("rejects the otherwise-valid 33 MiB Auth response from the review", async () => {
    const h = captureFixture();
    const original = h.transport.getMockImplementation()!;
    let oversized: Response | undefined;
    h.transport.mockImplementation(async (url, init) => {
      const response = await original(url, init);
      if (!url.endsWith("/config/auth")) return response;
      oversized = new Response(
        JSON.stringify({
          ...h.state.auth,
          reviewPadding: "x".repeat(33 * 1024 * 1024),
        }),
      );
      return oversized;
    });
    await expect(
      captureBaselineCandidate(h.options, h.dependencies),
    ).rejects.toThrow("BOOTSTRAP_READ_FAILED");
    expect(h.transport).toHaveBeenCalledTimes(6);
    expect(h.reads()).toBe(1);
    expect(oversized?.body?.locked).toBe(false);
  });

  it.each([0, 1])(
    "enforces the shared three-observation aggregate at limit + %s bytes",
    async (overflow) => {
      // First measure the fully valid control. Only byte padding changes below.
      const control = captureFixture();
      const originalControl = control.transport.getMockImplementation()!;
      let baseBytes = 0;
      control.transport.mockImplementation(async (url, init) => {
        const response = await originalControl(url, init);
        const text = await response.text();
        baseBytes += Buffer.byteLength(text);
        return new Response(text);
      });
      await captureBaselineCandidate(control.options, control.dependencies);
      const extra = BOOTSTRAP_OBSERVATION_MAX_BYTES - baseBytes + overflow;
      expect(extra).toBeGreaterThan(0);
      const h = captureFixture();
      const original = h.transport.getMockImplementation()!;
      const streams: ReturnType<typeof paddedResponse>[] = [];
      h.transport.mockImplementation(async (url, init) => {
        const response = await original(url, init);
        if (
          !init.body ||
          JSON.parse(init.body).query !== BOOTSTRAP_CATALOG_QUERY
        )
          return response;
        const text = await response.text();
        const index = streams.length;
        const size =
          Buffer.byteLength(text) +
          Math.floor(extra / 6) +
          (index === 5 ? extra % 6 : 0);
        expect(size).toBeLessThan(BOOTSTRAP_RESPONSE_MAX_BYTES);
        const stream = paddedResponse(text, size);
        streams.push(stream);
        return stream.response;
      });
      const result = captureBaselineCandidate(h.options, h.dependencies);
      if (overflow) {
        await expect(result).rejects.toThrow("BOOTSTRAP_READ_FAILED");
        expect(streams[5].cancel).toHaveBeenCalledTimes(1);
      } else {
        expect((await result).operational).toBe(false);
        expect(streams.every((s) => s.cancel.mock.calls.length === 0)).toBe(
          true,
        );
      }
      expect(h.transport).toHaveBeenCalledTimes(30);
      expect(h.reads()).toBe(6);
      expect(streams.every((s) => s.response.body?.locked === false)).toBe(
        true,
      );
    },
  );

  it("counts UTF-8 bytes rather than JavaScript characters", async () => {
    const h = captureFixture();
    const json = JSON.stringify({
      padding: "é".repeat(BOOTSTRAP_RESPONSE_MAX_BYTES / 2),
    });
    expect(json.length).toBeLessThan(BOOTSTRAP_RESPONSE_MAX_BYTES);
    expect(Buffer.byteLength(json)).toBeGreaterThan(
      BOOTSTRAP_RESPONSE_MAX_BYTES,
    );
    h.transport.mockResolvedValueOnce(new Response(json));
    await expect(
      captureBaselineCandidate(h.options, h.dependencies),
    ).rejects.toThrow("BOOTSTRAP_READ_FAILED");
    expect(h.transport).toHaveBeenCalledTimes(1);
  });

  it("checks the unchanged clock during streaming and cancels on expiry", async () => {
    const h = captureFixture();
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream(
        {
          pull(controller) {
            h.time = captureClock + 60_001;
            controller.enqueue(new TextEncoder().encode("["));
          },
          cancel,
        },
        { highWaterMark: 0 },
      ),
    );
    h.transport.mockResolvedValueOnce(response);
    await expect(
      captureBaselineCandidate(h.options, h.dependencies),
    ).rejects.toThrow("BOOTSTRAP_READ_FAILED");
    expect(h.transport).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(response.body?.locked).toBe(false);
  });

  it.each(["missing body", "invalid JSON", "stream error"])(
    "sanitizes %s without retrying",
    async (kind) => {
      const h = captureFixture();
      const response =
        kind === "missing body"
          ? new Response(null)
          : kind === "invalid JSON"
            ? new Response("PRIVATE_INVALID_JSON")
            : new Response(
                new ReadableStream({
                  pull(controller) {
                    controller.error(Error("PRIVATE_STREAM_ERROR"));
                  },
                }),
              );
      h.transport.mockResolvedValueOnce(response);
      await expect(
        captureBaselineCandidate(h.options, h.dependencies),
      ).rejects.toThrow(/^BOOTSTRAP_READ_FAILED$/);
      expect(h.transport).toHaveBeenCalledTimes(1);
      expect(response.body?.locked ?? false).toBe(false);
    },
  );
});
