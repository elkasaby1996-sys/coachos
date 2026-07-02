import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { notificationsKeys } from "./use-notifications";

export function useNotificationRealtime({
  userId,
}: {
  userId: string | null;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

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
      queryClient.invalidateQueries({
        queryKey: ["pt-compose-conversations"],
      });
      queryClient.invalidateQueries({
        queryKey: ["pt-compose-unread"],
      });
      queryClient.invalidateQueries({
        queryKey: ["pt-messages-conversations"],
      });
      queryClient.invalidateQueries({
        queryKey: ["pt-messages-unread"],
      });
      queryClient.invalidateQueries({
        queryKey: ["client-message-fab-conversations", userId],
      });
      queryClient.invalidateQueries({
        queryKey: ["client-message-fab-unread", userId],
      });
      queryClient.invalidateQueries({
        queryKey: ["client-messages-workspace-conversations", userId],
      });
      queryClient.invalidateQueries({
        queryKey: ["client-messages-workspace-unread"],
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
  }, [queryClient, userId]);
}
