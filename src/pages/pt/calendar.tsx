import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  DashboardCard,
  EmptyState,
  Skeleton,
  StatusPill,
} from "../../components/ui/coachos";
import {
  SurfaceCard,
  SurfaceCardContent,
} from "../../components/client/portal";
import { WorkspacePageHeader } from "../../components/pt/workspace-page-header";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../lib/use-workspace";
import {
  addDaysToDateString,
  formatDateInTimezone,
  getTodayInTimezone,
  getWeekStartSunday,
} from "../../lib/date-utils";
import {
  checkinOperationalStatusMap,
  getCheckinOperationalState,
  type CheckinOperationalState,
} from "../../lib/checkin-review";
import { cn } from "../../lib/utils";
import {
  filterMentionUsers,
  getActiveMentionQuery,
  getSelectedMentionIds,
  insertMention,
  type CalendarMentionUser,
} from "../../features/calendar/mentions";

const getMonthStartKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
};

const getMonthLabel = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "long", year: "numeric" });

const getClientFirstName = (displayName: string | null) => {
  const value = displayName?.trim();
  if (!value) return "Client";
  return value.split(/\s+/)[0] ?? "Client";
};

const getPossessiveLabel = (displayName: string | null) => {
  const firstName = getClientFirstName(displayName);
  if (firstName.toLowerCase().endsWith("s")) {
    return `${firstName}'`;
  }
  return `${firstName}'s`;
};

const getCalendarCheckinLabel = (displayName: string | null) =>
  `${getPossessiveLabel(displayName)} check-in`;

const buildCalendarDays = (monthCursor: Date) => {
  const monthStartKey = getMonthStartKey(monthCursor);
  const gridStartKey = getWeekStartSunday(monthStartKey);
  const allDays = Array.from({ length: 42 }).map((_, index) => {
    const key = addDaysToDateString(gridStartKey, index);
    const inMonth = key.slice(0, 7) === monthStartKey.slice(0, 7);
    return { key, inMonth };
  });
  const days = allDays.filter((day) => day.inMonth);
  const gridEndKey = addDaysToDateString(gridStartKey, 41);
  return { days, gridStartKey, gridEndKey };
};

type ClientRow = {
  id: string;
  display_name: string | null;
};

type CheckinRow = {
  id: string;
  client_id: string | null;
  week_ending_saturday: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
};

type CoachEventRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
};

type CalendarMentionRpcRow = {
  user_id: string;
  display_name: string | null;
  role: string | null;
};

export function PtCalendarPage() {
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => getTodayInTimezone(null), []);
  const [monthCursor, setMonthCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [deleteEventDialogOpen, setDeleteEventDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CoachEventRow | null>(
    null,
  );
  const [deleteEventTarget, setDeleteEventTarget] =
    useState<CoachEventRow | null>(null);
  const [eventMode, setEventMode] = useState<"create" | "edit">("create");
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState(todayKey);
  const [eventStartTime, setEventStartTime] = useState("09:00");
  const [eventEndTime, setEventEndTime] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventMentionIds, setEventMentionIds] = useState<string[]>([]);

  const { days, gridStartKey, gridEndKey } = useMemo(
    () => buildCalendarDays(monthCursor),
    [monthCursor],
  );

  const clientsQuery = useQuery({
    queryKey: ["pt-calendar-clients", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, display_name")
        .eq("workspace_id", workspaceId ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
  });

  const checkinsQuery = useQuery({
    queryKey: [
      "pt-calendar-checkins",
      workspaceId,
      gridStartKey,
      gridEndKey,
      clientsQuery.data,
    ],
    enabled: !!workspaceId && (clientsQuery.data?.length ?? 0) > 0,
    queryFn: async () => {
      const { error: ensureError } = await supabase.rpc(
        "ensure_workspace_checkins",
        {
          p_workspace_id: workspaceId ?? "",
          p_range_start: gridStartKey,
          p_range_end: gridEndKey,
        },
      );
      if (ensureError) throw ensureError;

      const clientIds = (clientsQuery.data ?? []).map((row) => row.id);
      const { data, error } = await supabase
        .from("checkins")
        .select(
          "id, client_id, week_ending_saturday, submitted_at, reviewed_at",
        )
        .in("client_id", clientIds)
        .gte("week_ending_saturday", gridStartKey)
        .lte("week_ending_saturday", gridEndKey);
      if (error) throw error;
      return (data ?? []) as CheckinRow[];
    },
  });

  const eventsQuery = useQuery({
    queryKey: ["pt-calendar-events", workspaceId, gridStartKey, gridEndKey],
    enabled: !!workspaceId,
    queryFn: async () => {
      const startIso = new Date(`${gridStartKey}T00:00:00`).toISOString();
      const endIso = new Date(`${gridEndKey}T23:59:59`).toISOString();
      const { data, error } = await supabase
        .from("coach_calendar_events")
        .select("id, title, description, starts_at, ends_at")
        .eq("workspace_id", workspaceId ?? "")
        .gte("starts_at", startIso)
        .lte("starts_at", endIso)
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CoachEventRow[];
    },
  });

  const mentionUsersQuery = useQuery({
    queryKey: ["pt-calendar-mention-users", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "list_calendar_mention_users",
        { p_workspace_id: workspaceId ?? "" },
      );
      if (error) throw error;
      return ((data ?? []) as CalendarMentionRpcRow[])
        .map((row) => ({
          user_id: row.user_id,
          display_name: row.display_name?.trim() || "User",
          role: row.role ?? "user",
        }))
        .filter((row) => row.user_id) as CalendarMentionUser[];
    },
  });

  const createEventMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId) {
        throw new Error("Workspace not found.");
      }
      if (!eventTitle.trim()) {
        throw new Error("Event title is required.");
      }
      const startValue = `${eventDate}T${eventStartTime || "09:00"}`;
      const endValue = eventEndTime ? `${eventDate}T${eventEndTime}` : null;
      const payload = {
        workspace_id: workspaceId,
        title: eventTitle.trim(),
        description: eventDescription.trim() || null,
        starts_at: new Date(startValue).toISOString(),
        ends_at: endValue ? new Date(endValue).toISOString() : null,
      };
      if (eventMode === "edit" && editingEventId) {
        const { error } = await supabase
          .from("coach_calendar_events")
          .update(payload)
          .eq("id", editingEventId);
        if (error) throw error;
        return;
      }
      const mentionedUserIds = getSelectedMentionIds(
        eventMentionIds,
        mentionUsersQuery.data ?? [],
        eventDescription,
      );
      const { error } = await supabase.rpc(
        "create_coach_calendar_event_with_mentions",
        {
          p_workspace_id: workspaceId,
          p_title: payload.title,
          p_description: payload.description,
          p_starts_at: payload.starts_at,
          p_ends_at: payload.ends_at,
          p_mentioned_user_ids: mentionedUserIds,
        },
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["pt-calendar-events", workspaceId],
      });
      setEventDialogOpen(false);
      setEventTitle("");
      setEventDescription("");
      setEventMentionIds([]);
      setEventEndTime("");
      setEventMode("create");
      setEditingEventId(null);
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from("coach_calendar_events")
        .delete()
        .eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["pt-calendar-events", workspaceId],
      });
      setDeleteEventDialogOpen(false);
      setEventDetailsOpen(false);
      setSelectedEvent(null);
      setDeleteEventTarget(null);
    },
  });

  const monthLabel = useMemo(() => getMonthLabel(monthCursor), [monthCursor]);
  const handleReturnToToday = useCallback(() => {
    const todayDate = new Date(`${todayKey}T00:00:00`);
    setMonthCursor(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
    setSelectedDateKey(todayKey);
  }, [todayKey]);
  const openCreateEventDialog = useCallback((dateKey: string) => {
    setSelectedDateKey(dateKey);
    setEventDate(dateKey);
    setEventMode("create");
    setEditingEventId(null);
    setEventTitle("");
    setEventDescription("");
    setEventMentionIds([]);
    setEventStartTime("09:00");
    setEventEndTime("");
    setEventDialogOpen(true);
  }, []);
  const isSavingEvent = createEventMutation.isPending;

  const clientMap = useMemo(() => {
    const map = new Map<string, ClientRow>();
    (clientsQuery.data ?? []).forEach((row) => map.set(row.id, row));
    return map;
  }, [clientsQuery.data]);

  const checkinsByDate = useMemo(() => {
    const map = new Map<string, CheckinRow[]>();
    (checkinsQuery.data ?? []).forEach((row) => {
      if (!row.week_ending_saturday) return;
      const list = map.get(row.week_ending_saturday) ?? [];
      list.push(row);
      map.set(row.week_ending_saturday, list);
    });
    return map;
  }, [checkinsQuery.data]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CoachEventRow[]>();
    (eventsQuery.data ?? []).forEach((row) => {
      const key = formatDateInTimezone(row.starts_at, null);
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    });
    return map;
  }, [eventsQuery.data]);

  const isLoading =
    clientsQuery.isLoading || checkinsQuery.isLoading || eventsQuery.isLoading;
  const selectedDateCheckins = useMemo(
    () => checkinsByDate.get(selectedDateKey) ?? [],
    [checkinsByDate, selectedDateKey],
  );
  const selectedDateEvents = useMemo(
    () => eventsByDate.get(selectedDateKey) ?? [],
    [eventsByDate, selectedDateKey],
  );
  const selectedDateLabel = useMemo(
    () =>
      new Date(`${selectedDateKey}T00:00:00`).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    [selectedDateKey],
  );
  const mentionQuery = useMemo(
    () => getActiveMentionQuery(eventDescription),
    [eventDescription],
  );
  const mentionSuggestions = useMemo(
    () => filterMentionUsers(mentionUsersQuery.data ?? [], mentionQuery),
    [mentionQuery, mentionUsersQuery.data],
  );
  const selectedMentionUsers = useMemo(() => {
    const ids = getSelectedMentionIds(
      eventMentionIds,
      mentionUsersQuery.data ?? [],
      eventDescription,
    );
    return ids
      .map((id) =>
        (mentionUsersQuery.data ?? []).find((user) => user.user_id === id),
      )
      .filter(Boolean) as CalendarMentionUser[];
  }, [eventDescription, eventMentionIds, mentionUsersQuery.data]);

  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        title="Coach Calendar"
        description="Click a date to view scheduled items."
        className="w-full justify-end"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <SurfaceCard>
          <SurfaceCardContent className="px-5 py-5 sm:px-6 sm:py-6">
            <div className="flex items-center justify-between gap-2">
              <div className="text-lg font-semibold text-foreground">
                {monthLabel}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleReturnToToday}
                  disabled={
                    selectedDateKey === todayKey &&
                    getMonthStartKey(monthCursor) ===
                      getMonthStartKey(new Date(`${todayKey}T00:00:00`))
                  }
                >
                  Today
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  aria-label="Previous month"
                  onClick={() =>
                    setMonthCursor(
                      (prev) =>
                        new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                    )
                  }
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  aria-label="Next month"
                  onClick={() =>
                    setMonthCursor(
                      (prev) =>
                        new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                    )
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-4 text-sm text-muted-foreground">
              Click a date to view scheduled items.
            </div>

            <div className="mt-4 grid grid-cols-7 gap-3 text-xs text-muted-foreground">
              {"Sun Mon Tue Wed Thu Fri Sat".split(" ").map((day) => (
                <div
                  key={day}
                  className="text-center uppercase tracking-[0.2em]"
                >
                  {day}
                </div>
              ))}
            </div>

            {isLoading ? (
              <div className="mt-4 space-y-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
                {days.map((day) => {
                  const checkins = checkinsByDate.get(day.key) ?? [];
                  const events = eventsByDate.get(day.key) ?? [];
                  const visibleCheckins = checkins.slice(0, 2);
                  const visibleEvents =
                    visibleCheckins.length >= 2
                      ? []
                      : events.slice(0, 2 - visibleCheckins.length);
                  const hiddenItemCount =
                    checkins.length +
                    events.length -
                    visibleCheckins.length -
                    visibleEvents.length;
                  const isToday = day.key === todayKey;
                  const isSelected = day.key === selectedDateKey;
                  const hasItems = checkins.length + events.length > 0;
                  const dayState = (
                    [
                      "overdue",
                      "due",
                      "upcoming",
                      "submitted",
                      "reviewed",
                    ] as CheckinOperationalState[]
                  ).find((state) =>
                    checkins.some(
                      (row) =>
                        getCheckinOperationalState(row, todayKey) === state,
                    ),
                  );
                  return (
                    <div
                      key={day.key}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedDateKey(day.key)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedDateKey(day.key);
                        }
                      }}
                      className={cn(
                        "flex min-h-[176px] flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/40 p-4 text-left transition hover:border-border",
                        !day.inMonth && "opacity-50",
                        isToday && "border-accent/60 bg-accent/10",
                        isSelected && "border-primary/40 bg-primary/[0.08]",
                        hasItems &&
                          !isToday &&
                          "border-border/80 bg-background/55 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.75)]",
                        dayState === "submitted" &&
                          "border-primary/30 bg-primary/[0.07]",
                        dayState === "overdue" &&
                          "border-destructive/35 bg-destructive/[0.06]",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-sm font-semibold",
                            isToday
                              ? "border-primary/45 bg-primary/16 text-primary"
                              : "border-border/70 bg-background/60 text-foreground",
                          )}
                        >
                          {day.key.slice(-2)}
                        </span>
                        <button
                          type="button"
                          aria-label={`Create event on ${new Date(
                            `${day.key}T00:00:00`,
                          ).toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          })}`}
                          disabled={!workspaceId}
                          onClick={(event) => {
                            event.stopPropagation();
                            openCreateEventDialog(day.key);
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background/75 text-muted-foreground shadow-sm transition hover:border-primary/35 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="mt-4 flex-1 space-y-2.5">
                        {visibleCheckins.map((row) => {
                          const client = row.client_id
                            ? clientMap.get(row.client_id)
                            : null;
                          const state = getCheckinOperationalState(
                            row,
                            todayKey,
                          );
                          return (
                            <button
                              key={row.id}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (row.client_id) {
                                  navigate(
                                    state === "submitted" ||
                                      state === "reviewed"
                                      ? `/pt/clients/${row.client_id}?tab=checkins&checkin=${row.id}`
                                      : `/pt/clients/${row.client_id}?tab=checkins`,
                                  );
                                }
                              }}
                              aria-label={`Open ${getCalendarCheckinLabel(client?.display_name ?? null)}`}
                              className={cn(
                                "group w-full rounded-xl border px-3 py-2 text-left text-xs transition",
                                state === "overdue"
                                  ? "border-destructive/30 bg-destructive/[0.06] hover:border-destructive/45"
                                  : state === "submitted" ||
                                      state === "reviewed"
                                    ? "border-primary/25 bg-primary/[0.06] hover:border-primary/40"
                                    : "border-border/60 bg-muted/20 hover:border-border hover:bg-muted/30",
                              )}
                            >
                              <div className="truncate font-medium text-foreground transition-colors group-hover:text-primary">
                                {getCalendarCheckinLabel(
                                  client?.display_name ?? null,
                                )}
                              </div>
                            </button>
                          );
                        })}

                        {visibleEvents.map((row) => (
                          <button
                            key={row.id}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedEvent(row);
                              setEventDetailsOpen(true);
                            }}
                            aria-label={`Open event ${row.title}`}
                            className="group w-full rounded-xl border border-border/60 bg-background/55 px-3 py-2 text-left text-xs transition hover:border-border hover:bg-background/75"
                          >
                            <div className="truncate font-medium text-foreground transition-colors group-hover:text-primary">
                              {row.title}
                            </div>
                          </button>
                        ))}

                        {!hasItems ? (
                          <div className="pt-12">
                            <div className="h-px w-full bg-gradient-to-r from-transparent via-border/60 to-transparent" />
                          </div>
                        ) : hiddenItemCount > 0 ? (
                          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            +{hiddenItemCount} more
                          </div>
                        ) : null}
                      </div>

                      {hasItems ? (
                        <div className="mt-4 border-t border-border/55 pt-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          {checkins.length > 0 ? (
                            <span>
                              {checkins.length} check-in
                              {checkins.length > 1 ? "s" : ""}
                            </span>
                          ) : null}
                          {checkins.length > 0 && events.length > 0 ? (
                            <span className="px-1.5">/</span>
                          ) : null}
                          {events.length > 0 ? (
                            <span>
                              {events.length} event
                              {events.length > 1 ? "s" : ""}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </SurfaceCardContent>
        </SurfaceCard>

        <div className="space-y-6">
          <DashboardCard
            title={selectedDateLabel}
            subtitle="Events and assignments for this day."
          >
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : selectedDateCheckins.length === 0 &&
              selectedDateEvents.length === 0 ? (
              <EmptyState
                title="No items for this day"
                description="Create an event or check another date."
              />
            ) : (
              <div className="space-y-3">
                {selectedDateCheckins.map((row) => {
                  const client = row.client_id
                    ? clientMap.get(row.client_id)
                    : null;
                  const name = client?.display_name?.trim()
                    ? client.display_name
                    : "Client";
                  const state = getCheckinOperationalState(row, todayKey);
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => {
                        if (!row.client_id) return;
                        navigate(
                          state === "submitted" || state === "reviewed"
                            ? `/pt/clients/${row.client_id}?tab=checkins&checkin=${row.id}`
                            : `/pt/clients/${row.client_id}?tab=checkins`,
                        );
                      }}
                      className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-left transition hover:border-border"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">
                            {name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Check-in
                          </div>
                        </div>
                        <StatusPill
                          status={state}
                          statusMap={checkinOperationalStatusMap}
                        />
                      </div>
                    </button>
                  );
                })}
                {selectedDateEvents.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      setSelectedEvent(row);
                      setEventDetailsOpen(true);
                    }}
                    className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-left transition hover:border-border"
                  >
                    <div className="text-sm font-semibold text-foreground">
                      {row.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(row.starts_at).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </DashboardCard>
        </div>
      </div>

      <Dialog
        open={eventDialogOpen}
        onOpenChange={(open) => {
          setEventDialogOpen(open);
          if (!open) {
            createEventMutation.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>
              {eventMode === "edit" ? "Edit event" : "Create event"}
            </DialogTitle>
            <DialogDescription>
              Block time for check-in reviews or coaching calls.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                Title
              </label>
              <Input
                value={eventTitle}
                onChange={(event) => setEventTitle(event.target.value)}
                placeholder="Weekly review block"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label
                  htmlFor="calendar-event-date"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  Date
                </label>
                <Input
                  id="calendar-event-date"
                  type="date"
                  value={eventDate}
                  onChange={(event) => setEventDate(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Start time
                </label>
                <Input
                  type="time"
                  value={eventStartTime}
                  onChange={(event) => setEventStartTime(event.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  End time
                </label>
                <Input
                  type="time"
                  value={eventEndTime}
                  onChange={(event) => setEventEndTime(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="calendar-event-notes"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  Notes
                </label>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <AtSign className="h-3.5 w-3.5" />
                  Mention a user
                </span>
              </div>
              <div className="relative">
                <textarea
                  id="calendar-event-notes"
                  className="min-h-[112px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={eventDescription}
                  onChange={(event) => {
                    setEventDescription(event.target.value);
                    const mentionedIds = getSelectedMentionIds(
                      eventMentionIds,
                      mentionUsersQuery.data ?? [],
                      event.target.value,
                    );
                    setEventMentionIds(mentionedIds);
                  }}
                  placeholder="Optional details. Type @ to mention a client or coach."
                />
                {mentionSuggestions.length > 0 ? (
                  <div className="absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl">
                    {mentionSuggestions.map((user) => (
                      <button
                        key={user.user_id}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                        onClick={() => {
                          setEventDescription((current) =>
                            insertMention(current, user.display_name),
                          );
                          setEventMentionIds((current) =>
                            current.includes(user.user_id)
                              ? current
                              : [...current, user.user_id],
                          );
                        }}
                      >
                        <span className="min-w-0 truncate font-medium">
                          {user.display_name}
                        </span>
                        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
                          {user.role}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : mentionQuery !== null &&
                  !mentionUsersQuery.isLoading &&
                  (mentionUsersQuery.data ?? []).length === 0 ? (
                  <div className="absolute inset-x-0 bottom-full z-20 mb-2 rounded-xl border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-xl">
                    No mentionable users found.
                  </div>
                ) : null}
              </div>
              {selectedMentionUsers.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedMentionUsers.map((user) => (
                    <span
                      key={user.user_id}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                    >
                      @{user.display_name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs leading-5 text-muted-foreground">
                  Mentioned users receive an in-app notification when the event
                  is created.
                </p>
              )}
            </div>
          </div>
          {createEventMutation.error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              Unable to save this event right now. Please try again.
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setEventDialogOpen(false)}
              disabled={isSavingEvent}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createEventMutation.mutate()}
              disabled={isSavingEvent}
            >
              {isSavingEvent
                ? "Saving..."
                : eventMode === "edit"
                  ? "Save changes"
                  : "Save event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={eventDetailsOpen} onOpenChange={setEventDetailsOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Event details</DialogTitle>
            <DialogDescription>
              {selectedEvent
                ? new Date(selectedEvent.starts_at).toLocaleString()
                : "Details for this event."}
            </DialogDescription>
          </DialogHeader>
          {selectedEvent ? (
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Title
                </div>
                <div className="text-base font-semibold text-foreground">
                  {selectedEvent.title}
                </div>
              </div>
              {selectedEvent.description ? (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Notes
                  </div>
                  <div className="text-sm text-foreground">
                    {selectedEvent.description}
                  </div>
                </div>
              ) : null}
              {selectedEvent.ends_at ? (
                <div className="text-xs text-muted-foreground">
                  Ends at {new Date(selectedEvent.ends_at).toLocaleString()}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No event selected.
            </div>
          )}
          <DialogFooter>
            {selectedEvent ? (
              <div className="mr-auto flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!selectedEvent) return;
                    setEventMode("edit");
                    setEditingEventId(selectedEvent.id);
                    setEventTitle(selectedEvent.title ?? "");
                    setEventDescription(selectedEvent.description ?? "");
                    setEventMentionIds([]);
                    const dateKey = formatDateInTimezone(
                      selectedEvent.starts_at,
                      null,
                    );
                    const startTime = new Date(selectedEvent.starts_at)
                      .toLocaleTimeString("en-US", {
                        hour12: false,
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                      .slice(0, 5);
                    const endTime = selectedEvent.ends_at
                      ? new Date(selectedEvent.ends_at)
                          .toLocaleTimeString("en-US", {
                            hour12: false,
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                          .slice(0, 5)
                      : "";
                    setEventDate(dateKey);
                    setEventStartTime(startTime);
                    setEventEndTime(endTime);
                    setEventDetailsOpen(false);
                    setEventDialogOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!selectedEvent) return;
                    setDeleteEventTarget(selectedEvent);
                    setEventDetailsOpen(false);
                    setDeleteEventDialogOpen(true);
                  }}
                  disabled={deleteEventMutation.isPending}
                >
                  {deleteEventMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
              </div>
            ) : null}
            <Button
              variant="secondary"
              onClick={() => setEventDetailsOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteEventDialogOpen}
        onOpenChange={(open) => {
          if (!open && !deleteEventMutation.isPending) {
            setDeleteEventDialogOpen(false);
            setDeleteEventTarget(null);
            deleteEventMutation.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete calendar event?</DialogTitle>
            <DialogDescription>
              This removes{" "}
              <span className="font-medium text-foreground">
                {deleteEventTarget?.title ?? "this event"}
              </span>{" "}
              from your calendar.
            </DialogDescription>
          </DialogHeader>
          {deleteEventMutation.error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              Unable to delete this event right now. Please try again.
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={deleteEventMutation.isPending}
              onClick={() => setDeleteEventDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="border-destructive/40 bg-destructive/10 text-destructive hover:border-destructive/60 hover:bg-destructive/15 hover:text-destructive"
              disabled={deleteEventMutation.isPending || !deleteEventTarget}
              onClick={() => {
                if (deleteEventTarget) {
                  deleteEventMutation.mutate(deleteEventTarget.id);
                }
              }}
            >
              {deleteEventMutation.isPending ? "Deleting..." : "Delete event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
