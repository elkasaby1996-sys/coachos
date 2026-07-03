import { useEffect } from "react";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

const clientAssignmentQueryFamilies = new Set([
  "assigned-workout-today",
  "assigned-workouts-week",
  "assigned-workouts-week-plan",
  "client-workouts-unified",
  "assigned-workout",
  "assigned-workout-exercises",
  "client-workouts-active-sessions",
  "client-nutrition-plans",
  "client-nutrition-days",
  "client-nutrition-meals",
  "assigned-nutrition-today",
  "assigned-nutrition-week",
  "assigned-nutrition-day-v1",
  "assigned-nutrition-meals-v1",
  "client-checkin",
  "client-checkin-profile",
  "client-checkin-template",
  "client-checkin-workspace",
  "client-checkin-latest-template",
  "client-home-profiles",
]);

export const invalidateClientAssignmentQueries = (
  queryClient: QueryClient,
  clientId: string,
) =>
  queryClient.invalidateQueries({
    predicate: (query) => {
      const family = query.queryKey[0];
      if (
        typeof family !== "string" ||
        !clientAssignmentQueryFamilies.has(family)
      ) {
        return false;
      }

      return (
        query.queryKey.includes(clientId) ||
        family === "assigned-workout-exercises" ||
        family === "assigned-nutrition-meals-v1" ||
        family === "client-nutrition-meals"
      );
    },
  });

export const useClientAssignmentRealtime = (clientId: string | null) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!clientId) return;

    const refreshAssignments = () => {
      void invalidateClientAssignmentQueries(queryClient, clientId);
    };

    const channel = supabase
      .channel(`client-assignment-refresh-${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "assigned_workouts",
          filter: `client_id=eq.${clientId}`,
        },
        refreshAssignments,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "assigned_nutrition_plans",
          filter: `client_id=eq.${clientId}`,
        },
        refreshAssignments,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "checkins",
          filter: `client_id=eq.${clientId}`,
        },
        refreshAssignments,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "clients",
          filter: `id=eq.${clientId}`,
        },
        refreshAssignments,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clientId, queryClient]);
};
