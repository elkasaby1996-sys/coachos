import {
  InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { NotificationFilter, NotificationRecord } from "../lib/types";
import {
  defaultNotificationPreferences,
  fetchNotificationPreferences,
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  upsertNotificationPreferences,
} from "../api/notifications";

const PAGE_SIZE = 20;

export const notificationsKeys = {
  all: ["notifications"] as const,
  listRoot: (userId: string) => ["notifications", "list", userId] as const,
  list: (userId: string, limit: number, filter: NotificationFilter) =>
    ["notifications", "list", userId, filter, limit] as const,
  infiniteRoot: (userId: string) =>
    ["notifications", "infinite", userId] as const,
  infinite: (userId: string, filter: NotificationFilter) =>
    ["notifications", "infinite", userId, filter] as const,
  unreadCount: (userId: string) =>
    ["notifications", "unread-count", userId] as const,
  preferences: (userId: string) =>
    ["notifications", "preferences", userId] as const,
};

export function useNotificationsList({
  userId,
  limit = 8,
  filter = "all",
}: {
  userId: string | null;
  limit?: number;
  filter?: NotificationFilter;
}) {
  return useQuery({
    queryKey: userId ? notificationsKeys.list(userId, limit, filter) : [],
    enabled: !!userId,
    queryFn: () =>
      fetchNotifications({
        userId: userId ?? "",
        limit,
        filter,
      }),
  });
}

export function useInfiniteNotifications({
  userId,
  filter,
}: {
  userId: string | null;
  filter: NotificationFilter;
}) {
  return useInfiniteQuery({
    queryKey: userId ? notificationsKeys.infinite(userId, filter) : [],
    enabled: !!userId,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchNotifications({
        userId: userId ?? "",
        filter,
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.length * PAGE_SIZE : undefined,
  });
}

export function useUnreadNotificationCount(userId: string | null) {
  return useQuery({
    queryKey: userId ? notificationsKeys.unreadCount(userId) : [],
    enabled: !!userId,
    queryFn: fetchUnreadNotificationCount,
  });
}

function updateNotificationInInfiniteData(
  data: InfiniteData<NotificationRecord[]> | undefined,
  notification: NotificationRecord,
) {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) =>
      page.map((row) => (row.id === notification.id ? notification : row)),
    ),
  };
}

export function useMarkNotificationRead(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: (notification) => {
      if (!userId || !notification) return;

      queryClient.setQueriesData<NotificationRecord[]>(
        { queryKey: notificationsKeys.listRoot(userId) },
        (current) =>
          current?.map((row) =>
            row.id === notification.id ? notification : row,
          ) ?? current,
      );

      queryClient.setQueriesData<InfiniteData<NotificationRecord[]>>(
        { queryKey: notificationsKeys.infiniteRoot(userId) },
        (current) => updateNotificationInInfiniteData(current, notification),
      );

      queryClient.setQueryData<number>(
        notificationsKeys.unreadCount(userId),
        (current) => Math.max((current ?? 1) - 1, 0),
      );
    },
  });
}

export function useMarkAllNotificationsRead(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      if (!userId) return;

      queryClient.setQueriesData<NotificationRecord[]>(
        { queryKey: notificationsKeys.listRoot(userId) },
        (current) =>
          current?.map((row) => ({
            ...row,
            is_read: true,
            read_at: row.read_at ?? new Date().toISOString(),
          })) ?? current,
      );

      queryClient.setQueriesData<InfiniteData<NotificationRecord[]>>(
        { queryKey: notificationsKeys.infiniteRoot(userId) },
        (current) =>
          current
            ? {
                ...current,
                pages: current.pages.map((page) =>
                  page.map((row) => ({
                    ...row,
                    is_read: true,
                    read_at: row.read_at ?? new Date().toISOString(),
                  })),
                ),
              }
            : current,
      );

      queryClient.setQueryData(notificationsKeys.unreadCount(userId), 0);
    },
  });
}

export function useNotificationPreferences(userId: string | null) {
  return useQuery({
    queryKey: userId ? notificationsKeys.preferences(userId) : [],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null;
      return (
        (await fetchNotificationPreferences(userId)) ??
        defaultNotificationPreferences(userId)
      );
    },
  });
}

export function useUpdateNotificationPreferences(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Record<string, boolean>) => {
      if (!userId) throw new Error("User not found.");
      return upsertNotificationPreferences({
        user_id: userId,
        ...input,
      });
    },
    onSuccess: (preferences) => {
      if (!userId || !preferences) return;
      queryClient.setQueryData(
        notificationsKeys.preferences(userId),
        preferences,
      );
    },
  });
}
