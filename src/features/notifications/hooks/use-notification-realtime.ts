import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import type { NotificationRecord } from "../lib/types";
import { notificationsKeys } from "./use-notifications";

export function useNotificationRealtime({
  userId,
  onHighPriority,
}: {
  userId: string | null;
  onHighPriority?: (notification: NotificationRecord) => void;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    void onHighPriority;

    const invalidateNotificationCenter = () => {
      queryClient.invalidateQueries({
        queryKey: notificationsKeys.listRoot(userId),
      });
      queryClient.invalidateQueries({
        queryKey: notificationsKeys.infiniteRoot(userId),
      });
      queryClient.invalidateQueries({
        queryKey: notificationsKeys.unreadCount(userId),
      });
    };

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notification_deliveries",
          filter: `recipient_user_id=eq.${userId}`,
        },
        invalidateNotificationCenter,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onHighPriority, queryClient, userId]);
}
