import { useEffect } from "react";
import { InfiniteData, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import type { NotificationRecord } from "../lib/types";
import { sortNotifications } from "../lib/notification-utils";
import { notificationsKeys } from "./use-notifications";

function prependNotification(
  current: NotificationRecord[] | undefined,
  incoming: NotificationRecord,
) {
  const next = sortNotifications([
    incoming,
    ...(current ?? []).filter((row) => row.id !== incoming.id),
  ]);
  return next;
}

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

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload) => {
          const incoming = payload.new as NotificationRecord;

          queryClient.setQueriesData<NotificationRecord[]>(
            { queryKey: notificationsKeys.listRoot(userId) },
            (current) => prependNotification(current, incoming),
          );

          queryClient.setQueriesData<InfiniteData<NotificationRecord[]>>(
            { queryKey: notificationsKeys.infiniteRoot(userId) },
            (current) =>
              current
                ? {
                    ...current,
                    pages: current.pages.map((page, index) =>
                      index === 0
                        ? prependNotification(page, incoming)
                        : page.filter((row) => row.id !== incoming.id),
                    ),
                  }
                : current,
          );

          if (!incoming.is_read) {
            queryClient.setQueryData<number>(
              notificationsKeys.unreadCount(userId),
              (current) => (current ?? 0) + 1,
            );
          }

          if (incoming.priority === "high") {
            onHighPriority?.(incoming);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onHighPriority, queryClient, userId]);
}
