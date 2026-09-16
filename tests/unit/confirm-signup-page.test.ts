// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verifyOtp: vi.fn(), navigate: vi.fn() }));
vi.mock("../../src/lib/supabase", () => ({
  supabase: { auth: { verifyOtp: mocks.verifyOtp } },
}));
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => mocks.navigate,
}));
vi.mock("../../src/components/common/auth-backdrop", () => ({
  AuthBackdrop: ({ children }: { children: React.ReactNode }) => children,
}));
import { ConfirmSignupPage } from "../../src/pages/public/confirm-signup";

let root: Root;
let container: HTMLDivElement;
const credential = "synthetic-confirmation-fixture";
const success = (account_type: unknown) => {
  const user = { id: "fixture-user", user_metadata: { account_type } };
  return { data: { user, session: { user } }, error: null };
};
async function mount(url = `/confirm-signup#token_hash=${credential}`) {
  window.history.replaceState(null, "", url);
  await act(async () => {
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(MemoryRouter, null, createElement(ConfirmSignupPage)),
      ),
    );
  });
}
function confirmButton() {
  return [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Confirm email",
  )!;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("explicit signup confirmation", () => {
  it("AUTH-CONFIRM-010/013: StrictMode load scrubs history without verification or storage", async () => {
    const replace = vi.spyOn(window.history, "replaceState");
    await mount(
      `/confirm-signup?next=//evil.example#token_hash=${credential}&type=recovery`,
    );
    expect(
      window.location.pathname + window.location.search + window.location.hash,
    ).toBe("/confirm-signup");
    expect(replace.mock.calls.at(-1)?.[2]).toBe("/confirm-signup");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(confirmButton()).toBeDefined();
    expect(document.documentElement.innerHTML).not.toContain(credential);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(
      document.querySelector('meta[name="robots"]')?.getAttribute("content"),
    ).toBe("noindex,nofollow");
  });

  it.each([
    [
      "pt",
      "/auth/callback?type=signup&intent=pt&next=/pt/onboarding/workspace",
    ],
    [
      "client",
      "/auth/callback?type=signup&intent=client&next=/client/onboarding/account",
    ],
    [undefined, "/auth/callback?type=signup"],
  ])(
    "AUTH-CONFIRM-011/014: %s verification forwards only fixed routing",
    async (intent, path) => {
      mocks.verifyOtp.mockResolvedValue(success(intent));
      await mount(
        `/confirm-signup?next=https://evil.example&intent=pt#token_hash=${credential}&type=recovery&returnTo=//evil.example`,
      );
      const button = confirmButton();
      await act(async () => button.click());
      expect(mocks.verifyOtp).toHaveBeenCalledExactlyOnceWith({
        token_hash: credential,
        type: "email",
      });
      expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith(path, {
        replace: true,
      });
      expect(JSON.stringify(mocks.navigate.mock.calls)).not.toMatch(
        /token_hash|synthetic-confirmation/,
      );
      // Successful verification clears the credential even before unmount.
      await act(async () => button.click());
      expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
    },
  );

  it("AUTH-CONFIRM-012: synchronous double click cannot race the pending state", async () => {
    let resolve!: (value: ReturnType<typeof success>) => void;
    mocks.verifyOtp.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await mount();
    const button = confirmButton();
    await act(async () => {
      button.click();
      button.click();
    });
    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(mocks.navigate).not.toHaveBeenCalled();
    await act(async () => resolve(success("pt")));
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it("missing/query-only credentials never call Supabase", async () => {
    await mount(`/confirm-signup?token_hash=${credential}`);
    expect(container.textContent).toContain("Confirmation link unavailable");
    expect(confirmButton()).toBeUndefined();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it.each(["provider", "throw", "no-user", "no-session", "mismatched-user"])(
    "%s failure is bounded and never navigates",
    async (mode) => {
      const consoleError = vi.spyOn(console, "error");
      const response = success("pt");
      if (mode === "throw")
        mocks.verifyOtp.mockRejectedValue(new Error(credential));
      else
        mocks.verifyOtp.mockResolvedValue({
          error: mode === "provider" ? { message: credential } : null,
          data: {
            user: mode === "no-user" ? null : response.data.user,
            session:
              mode === "no-session"
                ? null
                : mode === "mismatched-user"
                  ? { user: { id: "other-user" } }
                  : response.data.session,
          },
        });
      await mount();
      await act(async () => confirmButton().click());
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        "We couldn't confirm this email.",
      );
      expect(container.textContent).not.toContain(credential);
      expect(consoleError).not.toHaveBeenCalled();
      expect(mocks.navigate).not.toHaveBeenCalled();
      expect(confirmButton().disabled).toBe(false);
    },
  );
});
