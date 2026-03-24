import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import type { AppRole } from "../../../lib/auth";
import { notificationsKeys } from "./use-notifications";

export function useSyncNotificationReminders({
  userId,
  role,
}: {
  userId: string | null;
  role: AppRole;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || role !== "pt") return;

    let active = true;

    const sync = async () => {
      const { error } = await supabase.rpc("sync_notification_reminders");
      if (error || !active) return;

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

    void sync();

    return () => {
      active = false;
    };
  }, [queryClient, role, userId]);
}
