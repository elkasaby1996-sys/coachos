// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

type SignupProps = {
  preFields: ReactNode;
  onEmailPasswordSubmit: (input: {
    email: string;
    password: string;
  }) => Promise<unknown>;
};
const mocks = vi.hoisted(() => ({
  ensurePtProfile: vi.fn(),
  updatePtProfile: vi.fn(),
  syncPtAccountIdentity: vi.fn(),
  persistPlan: vi.fn(),
  signup: vi.fn(),
  navigate: vi.fn(),
  props: null as SignupProps | null,
}));
vi.mock("../../src/components/ui/sign-up", () => ({
  AuthComponent: (props: SignupProps) => {
    mocks.props = props;
    return props.preFields;
  },
}));
vi.mock("../../src/lib/account-profiles", () => ({
  ensurePtProfile: mocks.ensurePtProfile,
  updatePtProfile: mocks.updatePtProfile,
  syncPtAccountIdentity: mocks.syncPtAccountIdentity,
  persistSignupIntent: vi.fn(),
}));
vi.mock(
  "../../src/features/account-entitlements/persist-requested-plan",
  () => ({ persistPendingRequestedPaidPlan: mocks.persistPlan }),
);
vi.mock("../../src/lib/auth-helpers", () => ({
  signUpWithEmailPassword: mocks.signup,
  buildAuthCallbackUrl: () => "/auth/callback",
  signInWithOAuth: vi.fn(),
}));
vi.mock("../../src/lib/auth", () => ({
  useBootstrapAuth: () => ({ bootstrapResolved: true }),
  useSessionAuth: () => ({ authLoading: false, session: null, user: null }),
  getAuthenticatedRedirectPath: () => "/pt/onboarding/workspace",
}));
vi.mock("react-router-dom", async (original) => ({
  ...(await original<typeof import("react-router-dom")>()),
  useNavigate: () => mocks.navigate,
}));
vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ limit: async () => ({ data: [], error: null }) }),
      }),
    }),
  },
}));
import { PtSignupPage } from "../../src/pages/public/pt-signup";

let root: Root;
let container: HTMLDivElement;
const queryClient = new QueryClient();
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.resetAllMocks();
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(PtSignupPage)),
      ),
    ),
  );
  await act(async () => {
    const input = container.querySelector("input")!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "Fixture Coach");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("immediate session synchronizes only the exact identity fields and preserves requested-plan persistence", async () => {
  mocks.signup.mockResolvedValue({
    data: { session: { user: { id: "fixture-user" } } },
    error: null,
  });
  const result = await mocks.props!.onEmailPasswordSubmit({
    email: "coach@example.invalid",
    password: "fixture-password",
  });
  expect(result).toEqual({ success: true });
  expect(mocks.syncPtAccountIdentity).toHaveBeenCalledExactlyOnceWith({
    userId: "fixture-user",
    fullName: "Fixture Coach",
    contactEmail: "coach@example.invalid",
    supportEmail: "coach@example.invalid",
  });
  expect(mocks.ensurePtProfile).toHaveBeenCalledExactlyOnceWith({
    userId: "fixture-user",
    fullName: "Fixture Coach",
  });
  expect(mocks.persistPlan).toHaveBeenCalledExactlyOnceWith(queryClient);
  expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith(
    "/pt/onboarding/workspace",
    { replace: true },
  );
});

it("still reports immediate-session identity failures", async () => {
  mocks.signup.mockResolvedValue({
    data: { session: { user: { id: "fixture-user" } } },
    error: null,
  });
  mocks.syncPtAccountIdentity.mockRejectedValue(
    new Error("fixture identity failure"),
  );
  expect(
    await mocks.props!.onEmailPasswordSubmit({
      email: "coach@example.invalid",
      password: "fixture-password",
    }),
  ).toEqual({ error: "fixture identity failure" });
  expect(mocks.navigate).not.toHaveBeenCalled();
});
