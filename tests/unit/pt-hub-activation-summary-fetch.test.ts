import { describe, expect, it, vi } from "vitest";
import { fetchPtHubActivationSummary } from "../../src/features/pt-hub/lib/pt-hub";

describe("fetchPtHubActivationSummary", () => {
  it("loads activation milestones through the aggregate RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          workspace_exists: true,
          activation_workspace_id: "workspace-1",
          activation_workspace_slug: "alpha",
          has_first_client: true,
          first_client_id: "client-1",
          has_workout_assigned: true,
          has_nutrition_assigned: false,
          has_checkin_assigned: true,
          has_co_coach_invited_or_active: true,
          client_count: 1,
        },
      ],
      error: null,
    });

    const summary = await fetchPtHubActivationSummary(
      { rpc },
      {
        workspaceId: "workspace-1",
        profileComplete: true,
        profilePublished: false,
      },
    );

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("pt_hub_activation_summary", {
      p_workspace_id: "workspace-1",
    });
    expect(summary).toEqual({
      workspaceExists: true,
      activationWorkspaceId: "workspace-1",
      activationWorkspaceSlug: "alpha",
      profileComplete: true,
      profilePublished: false,
      hasFirstClient: true,
      firstClientId: "client-1",
      hasWorkoutAssigned: true,
      hasNutritionAssigned: false,
      hasCheckInAssigned: true,
      hasCoCoachInvitedOrActive: true,
      clientCount: 1,
      coreCompletedCount: 5,
      coreTotalCount: 7,
    });
  });

  it("maps missing workspace responses to an empty activation state", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          workspace_exists: false,
          activation_workspace_id: null,
          activation_workspace_slug: null,
          has_first_client: false,
          first_client_id: null,
          has_workout_assigned: false,
          has_nutrition_assigned: false,
          has_checkin_assigned: false,
          has_co_coach_invited_or_active: false,
          client_count: 0,
        },
      ],
      error: null,
    });

    const summary = await fetchPtHubActivationSummary({ rpc });

    expect(rpc).toHaveBeenCalledWith("pt_hub_activation_summary", {
      p_workspace_id: null,
    });
    expect(summary.workspaceExists).toBe(false);
    expect(summary.hasFirstClient).toBe(false);
    expect(summary.hasWorkoutAssigned).toBe(false);
    expect(summary.hasNutritionAssigned).toBe(false);
    expect(summary.hasCheckInAssigned).toBe(false);
    expect(summary.hasCoCoachInvitedOrActive).toBe(false);
    expect(summary.coreCompletedCount).toBe(0);
    expect(summary.coreTotalCount).toBe(7);
  });
});
