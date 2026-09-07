import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useSessionAuth } from "../../../lib/auth";
import type { AnalyticsLead } from "./business-analytics";
import { readAnalyticsPages } from "./analytics-pagination";
import {
  analyticsWindow,
  type AnalyticsRange,
  type AnalyticsRecords,
  type AnalyticsClient,
  type AnalyticsWorkout,
  type AnalyticsCheckin,
  type AnalyticsAssessment,
} from "./business-analytics";

export function useAnalyticsLeads() {
  const { user } = useSessionAuth();
  return useQuery({
    queryKey: ["business-analytics-leads", user?.id],
    enabled: Boolean(user?.id),
    staleTime: 60_000,
    queryFn: async (): Promise<AnalyticsLead[]> => {
      const rows = await readAnalyticsPages((offset) =>
        supabase
          .from("pt_hub_leads")
          .select(
            "id,status,submitted_at,converted_at,converted_workspace_id,package_interest_id,package_interest,package_interest_label_snapshot,source",
          )
          .eq("user_id", user!.id)
          .order("id")
          .range(offset, offset + 499),
      );
      return rows.map((row) => ({
        id: row.id,
        status: row.status,
        submittedAt: row.submitted_at,
        convertedAt: row.converted_at,
        convertedWorkspaceId: row.converted_workspace_id,
        packageInterestId: row.package_interest_id,
        packageInterest: row.package_interest,
        packageInterestLabelSnapshot: row.package_interest_label_snapshot,
        source: row.source || "manual",
        sourceLabel:
          row.source === "public_profile"
            ? "Public profile"
            : row.source === "marketplace"
              ? "Marketplace"
              : "Manual",
      }));
    },
  });
}

export function useBusinessAnalyticsRecords(
  workspaceIds: string[],
  range: AnalyticsRange,
  enabled: boolean,
) {
  const { user } = useSessionAuth();
  const { start, end } = analyticsWindow(range);
  return useQuery({
    queryKey: [
      "business-analytics-records",
      user?.id,
      [...workspaceIds].sort().join("|"),
      start,
      end,
    ],
    enabled: enabled && Boolean(user?.id),
    staleTime: 60_000,
    queryFn: async (): Promise<AnalyticsRecords> => {
      if (!workspaceIds.length)
        return { clients: [], workouts: [], checkins: [], assessments: [] };
      const raw = await readAnalyticsPages<AnalyticsClient>((offset) =>
        supabase.rpc("pt_hub_clients_page", {
          p_limit: 500,
          p_offset: offset,
          p_workspace_id: null,
          p_lifecycle: null,
          p_search: null,
          p_segment: null,
          p_relationship_scope: "all",
        }),
      );
      const clients = raw.filter((c) => workspaceIds.includes(c.workspace_id));
      const workouts: AnalyticsWorkout[] = [],
        checkins: AnalyticsCheckin[] = [],
        assessments: AnalyticsAssessment[] = [];
      // Bound URL length and paginate every table; RLS remains authoritative.
      for (let i = 0; i < clients.length; i += 50) {
        const ids = clients.slice(i, i + 50).map((c) => c.id);
        const [w, c, a] = await Promise.all([
          readAnalyticsPages<AnalyticsWorkout>((offset) =>
            supabase
              .from("assigned_workouts")
              .select("id,client_id,scheduled_date,status,day_type")
              .in("client_id", ids)
              .gte("scheduled_date", start)
              .lte("scheduled_date", end)
              .order("id")
              .range(offset, offset + 499),
          ),
          // Include older outstanding reviews and review completions in this range.
          readAnalyticsPages<AnalyticsCheckin>((offset) =>
            supabase
              .from("checkins")
              .select(
                "id,client_id,week_ending_saturday,submitted_at,reviewed_at",
              )
              .in("client_id", ids)
              .or(
                `week_ending_saturday.gte.${start},reviewed_at.gte.${start},and(submitted_at.not.is.null,reviewed_at.is.null)`,
              )
              .order("id")
              .range(offset, offset + 499),
          ),
          readAnalyticsPages<AnalyticsAssessment>((offset) =>
            supabase
              .from("baseline_entries")
              .select("id,client_id,submitted_at,status")
              .in("client_id", ids)
              .gte("submitted_at", start)
              .lt("submitted_at", `${end}T23:59:59.999Z`)
              .order("id")
              .range(offset, offset + 499),
          ),
        ]);
        workouts.push(...w);
        checkins.push(...c);
        assessments.push(...a);
      }
      return { clients, workouts, checkins, assessments };
    },
  });
}
