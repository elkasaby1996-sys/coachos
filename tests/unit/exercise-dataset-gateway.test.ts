import { describe, expect, it, vi } from "vitest";
import {
  buildExerciseDatasetProviderRequest,
  decideExerciseProviderAccess,
  EXERCISE_DATASET_MAX_PROVIDER_RESPONSE_BYTES,
  handleExerciseDatasetGatewayRequest,
  validateExerciseDatasetGatewayInput,
} from "../../supabase/functions/_shared/exercise-dataset-gateway";

type GatewayDependencies = Parameters<
  typeof handleExerciseDatasetGatewayRequest
>[1];

const providerConfig = {
  baseUrl: "https://provider.example",
  apiKey: "server-secret",
  apiKeyHeader: "X-Provider-Key",
  apiHost: "provider.example",
};

const request = (body: unknown, authenticated = true) =>
  new Request(
    "https://project.supabase.co/functions/v1/exercise-dataset-search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authenticated ? { Authorization: "Bearer valid-token" } : {}),
      },
      body: JSON.stringify(body),
    },
  );

const dependencies = (
  overrides: Partial<GatewayDependencies> = {},
): GatewayDependencies => ({
  authenticate: vi.fn(async () => ({ id: "pt-user" })),
  authorize: vi.fn(async () => true),
  getProviderConfig: () => providerConfig,
  fetchImpl: vi.fn(async () =>
    Response.json({ data: [{ id: "provider-1", name: "Squat" }] }),
  ) as typeof fetch,
  correlationId: () => "correlation-1",
  now: () => 100,
  ...overrides,
});

const validBody = {
  name: "squat",
  bodyPart: "",
  equipment: "",
  target: "",
  limit: 24,
  cursor: null,
};

const readBody = async (response: Response) =>
  (await response.json()) as Record<string, any>;

describe("exercise dataset gateway", () => {
  it("returns unauthenticated when the bearer token is missing", async () => {
    const deps = dependencies();
    const response = await handleExerciseDatasetGatewayRequest(
      request(validBody, false),
      deps,
    );

    expect(response.status).toBe(401);
    expect((await readBody(response)).error.code).toBe("unauthenticated");
    expect(deps.authenticate).not.toHaveBeenCalled();
  });

  it("returns forbidden for an authenticated user without PT access", async () => {
    const response = await handleExerciseDatasetGatewayRequest(
      request(validBody),
      dependencies({ authorize: vi.fn(async () => false) }),
    );

    expect(response.status).toBe(403);
    expect((await readBody(response)).error.code).toBe("forbidden");
  });

  it("rejects malformed, unbounded, and caller-controlled upstream input", async () => {
    expect(
      validateExerciseDatasetGatewayInput({ ...validBody, limit: 51 }),
    ).toEqual({ ok: false });
    expect(
      validateExerciseDatasetGatewayInput({
        ...validBody,
        providerUrl: "https://attacker.example",
      }),
    ).toEqual({ ok: false });

    const response = await handleExerciseDatasetGatewayRequest(
      request({ ...validBody, cursor: { nested: true } }),
      dependencies(),
    );
    expect(response.status).toBe(400);
    expect((await readBody(response)).error.code).toBe("invalid_request");
  });

  it("returns provider_not_configured without calling upstream", async () => {
    const fetchImpl = vi.fn();
    const response = await handleExerciseDatasetGatewayRequest(
      request(validBody),
      dependencies({ getProviderConfig: () => null, fetchImpl }),
    );

    expect(response.status).toBe(503);
    expect((await readBody(response)).error.code).toBe(
      "provider_not_configured",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses only the configured provider route and headers on success", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ data: [{ id: 42, name: "Squat" }] }),
    ) as unknown as typeof fetch;
    const response = await handleExerciseDatasetGatewayRequest(
      request({ ...validBody, cursor: "next-page" }),
      dependencies({ fetchImpl }),
    );
    const body = await readBody(response);

    expect(response.status).toBe(200);
    expect(body.providerPayload).toEqual({
      data: [{ id: 42, name: "Squat" }],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://provider.example/api/v1/exercises?limit=24&name=squat&after=next-page",
      expect.objectContaining({
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Provider-Key": "server-secret",
          "X-RapidAPI-Host": "provider.example",
        },
      }),
    );
  });

  it("maps provider 429 responses without exposing provider content", async () => {
    const response = await handleExerciseDatasetGatewayRequest(
      request(validBody),
      dependencies({
        fetchImpl: vi.fn(
          async () => new Response("secret provider detail", { status: 429 }),
        ) as unknown as typeof fetch,
      }),
    );
    const body = await readBody(response);

    expect(response.status).toBe(429);
    expect(body.error.code).toBe("provider_rate_limited");
    expect(JSON.stringify(body)).not.toContain("secret provider detail");
  });

  it("maps provider timeouts distinctly", async () => {
    const response = await handleExerciseDatasetGatewayRequest(
      request(validBody),
      dependencies({
        fetchImpl: vi.fn(async () => {
          throw new DOMException("aborted", "AbortError");
        }) as unknown as typeof fetch,
      }),
    );

    expect(response.status).toBe(504);
    expect((await readBody(response)).error.code).toBe("provider_timeout");
  });

  it("maps malformed provider JSON and missing result lists", async () => {
    for (const providerResponse of [
      new Response("not-json", { status: 200 }),
      Response.json({ unexpected: true }),
    ]) {
      const response = await handleExerciseDatasetGatewayRequest(
        request(validBody),
        dependencies({
          fetchImpl: vi.fn(
            async () => providerResponse,
          ) as unknown as typeof fetch,
        }),
      );
      expect(response.status).toBe(502);
      expect((await readBody(response)).error.code).toBe(
        "provider_invalid_response",
      );
    }
  });

  it("rejects an oversized chunked provider body", async () => {
    const response = await handleExerciseDatasetGatewayRequest(
      request(validBody),
      dependencies({
        fetchImpl: vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                data: [
                  "x".repeat(EXERCISE_DATASET_MAX_PROVIDER_RESPONSE_BYTES),
                ],
              }),
              { status: 200 },
            ),
        ) as unknown as typeof fetch,
      }),
    );

    expect(response.status).toBe(502);
    expect((await readBody(response)).error.code).toBe(
      "provider_invalid_response",
    );
  });

  it("authorizes existing PT roles, owners, and PT Hub profiles only", () => {
    expect(
      decideExerciseProviderAccess({
        hasPtWorkspaceMembership: true,
        ownsWorkspace: false,
        hasPtHubProfile: false,
        hasPtProfile: false,
      }),
    ).toBe(true);
    expect(
      decideExerciseProviderAccess({
        hasPtWorkspaceMembership: false,
        ownsWorkspace: false,
        hasPtHubProfile: true,
        hasPtProfile: false,
      }),
    ).toBe(true);
    expect(
      decideExerciseProviderAccess({
        hasPtWorkspaceMembership: false,
        ownsWorkspace: false,
        hasPtHubProfile: false,
        hasPtProfile: false,
      }),
    ).toBe(false);
  });

  it("maps neutral filters to the current provider query contract", () => {
    const validation = validateExerciseDatasetGatewayInput({
      ...validBody,
      name: "Bench Press",
      bodyPart: "Chest",
      equipment: "Barbell",
      target: "Pectorals",
      cursor: "next-page",
    });
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const upstream = buildExerciseDatasetProviderRequest(
      validation.value,
      providerConfig,
    );

    expect(upstream.url).toBe(
      "https://provider.example/api/v1/exercises?limit=24&name=Bench+Press&bodyParts=Chest&equipments=Barbell&targetMuscles=Pectorals&after=next-page",
    );
    expect(upstream.url).not.toContain("cursor=");
  });
});
