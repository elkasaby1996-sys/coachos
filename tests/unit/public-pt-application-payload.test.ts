import { describe, expect, it } from "vitest";
import {
  buildPublicPtApplicationRpcInput,
  normalizePtLeadStatus,
} from "../../src/features/pt-hub/lib/pt-hub-leads";

describe("buildPublicPtApplicationRpcInput", () => {
  it("uses authenticated identity and package select contract without budget", () => {
    const payload = buildPublicPtApplicationRpcInput({
      input: {
        slug: "Coach Prime",
        fullName: "Jordan Applicant",
        phone: "555-2222",
        goalSummary: "Build strength",
        trainingExperience: "Intermediate",
        packageInterestId: "pkg-1",
        packageInterestLabelSnapshot: "12-week Strength",
      },
      authenticatedEmail: "jordan@example.com",
      authenticatedFullName: "Jordan Account",
    });

    expect(payload).toEqual({
      p_slug: "coach-prime",
      p_full_name: "Jordan Applicant",
      p_phone: "555-2222",
      p_goal_summary: "Build strength",
      p_training_experience: "Intermediate",
      p_package_interest_id: "pkg-1",
      p_package_interest_label_snapshot: "12-week Strength",
    });
    expect(Object.keys(payload)).not.toContain("p_budget_interest");
    expect(Object.keys(payload)).not.toContain("p_email");
  });

  it("falls back to account full name when form name is empty", () => {
    const payload = buildPublicPtApplicationRpcInput({
      input: {
        slug: "coach-prime",
        fullName: " ",
        phone: "",
        goalSummary: "Lose fat",
        trainingExperience: "",
        packageInterestId: null,
        packageInterestLabelSnapshot: null,
      },
      authenticatedEmail: "fit@example.com",
      authenticatedFullName: "Account Name",
    });

    expect(payload.p_full_name).toBe("Account Name");
    expect(payload.p_package_interest_id).toBeNull();
    expect(payload.p_package_interest_label_snapshot).toBeNull();
  });

  it("requires authenticated email", () => {
    expect(() =>
      buildPublicPtApplicationRpcInput({
        input: {
          slug: "coach-prime",
          fullName: "Any Name",
          phone: "",
          goalSummary: "Goal",
          trainingExperience: "",
          packageInterestId: null,
          packageInterestLabelSnapshot: null,
        },
        authenticatedEmail: " ",
        authenticatedFullName: "Any Name",
      }),
    ).toThrow(/account email is missing/i);
  });
});

describe("normalizePtLeadStatus", () => {
  it("maps legacy statuses into canonical lifecycle", () => {
    expect(normalizePtLeadStatus("reviewed")).toBe("new");
    expect(normalizePtLeadStatus("consultation_booked")).toBe("contacted");
    expect(normalizePtLeadStatus("accepted")).toBe("converted");
    expect(normalizePtLeadStatus("rejected")).toBe("declined");
    expect(normalizePtLeadStatus("archived")).toBe("declined");
  });
});
