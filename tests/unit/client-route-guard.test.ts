import { describe, expect, it } from "vitest";
import {
  getClientRouteGuardDecision,
  isClientRouteUuid,
} from "../../src/lib/client-route-guard";

const validClientId = "11111111-1111-4111-8111-111111111111";

describe("client route guard", () => {
  it("keeps the neutral loader up while client access is pending", () => {
    expect(
      getClientRouteGuardDecision({
        clientId: validClientId,
        accessLoading: true,
        accessAllowed: null,
        accessError: null,
      }),
    ).toBe("loading");
  });

  it("keeps a coach out of another coach's client shell", () => {
    expect(
      getClientRouteGuardDecision({
        clientId: validClientId,
        accessLoading: false,
        accessAllowed: false,
        accessError: null,
      }),
    ).toBe("redirect");
  });

  it("keeps an assistant out of an unassigned client shell", () => {
    expect(
      getClientRouteGuardDecision({
        clientId: validClientId,
        accessLoading: false,
        accessAllowed: false,
        accessError: null,
      }),
    ).toBe("redirect");
  });

  it("allows an authorized coach or assigned assistant to render", () => {
    expect(
      getClientRouteGuardDecision({
        clientId: validClientId,
        accessLoading: false,
        accessAllowed: true,
        accessError: null,
      }),
    ).toBe("render");
  });

  it("rejects invalid legacy client route params without calling uuid RPCs", () => {
    expect(isClientRouteUuid("not-a-client-id")).toBe(false);
    expect(
      getClientRouteGuardDecision({
        clientId: "not-a-client-id",
        accessLoading: false,
        accessAllowed: null,
        accessError: null,
      }),
    ).toBe("redirect");
  });
});
