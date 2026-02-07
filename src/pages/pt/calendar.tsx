import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
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
import { DashboardCard, EmptyState, Skeleton, StatusPill } from "../../components/ui/coachos";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../lib/use-workspace";
import { addDaysToDateString, formatDateInTimezone, getWeekStartSunday } from "../../lib/date-utils";
import { cn } from "../../lib/utils";

const pad = (value: number) => String(value).padStart(2, "0");

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getMonthStartKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
};

const getMonthLabel = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "long", year: "numeric" });

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
  return { days, gridStartKey, gridEndKey, monthStartKey };
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
};

type CoachEventRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
};

const statusMap = {
  due: { label: "Due", variant: "warning" },
};

export function PtCalendarPage() {
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => formatDateKey(today), [today]);
  const [monthCursor, setMonthCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CoachEventRow | null>(null);
  const [eventMode, setEventMode] = useState<"create" | "edit">("create");
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState(todayKey);
  const [eventStartTime, setEventStartTime] = useState("09:00");
  const [eventEndTime, setEventEndTime] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");

  const { days, gridStartKey, gridEndKey, monthStartKey } = useMemo(
    () => buildCalendarDays(monthCursor),
    [monthCursor]
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
    queryKey: ["pt-calendar-checkins", workspaceId, gridStartKey, gridEndKey, clientsQuery.data],
    enabled: !!workspaceId && (clientsQuery.data?.length ?? 0) > 0,
    queryFn: async () => {
      const clientIds = (clientsQuery.data ?? []).map((row) => row.id);
      const { data, error } = await supabase
        .from("checkins")
        .select("id, client_id, week_ending_saturday, submitted_at")
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
      const { error } = await supabase.from("coach_calendar_events").insert(payload);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pt-calendar-events", workspaceId] });
      setEventDialogOpen(false);
      setEventTitle("");
      setEventDescription("");
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
      await queryClient.invalidateQueries({ queryKey: ["pt-calendar-events", workspaceId] });
      setEventDetailsOpen(false);
      setSelectedEvent(null);
    },
  });

  const monthLabel = useMemo(() => getMonthLabel(monthCursor), [monthCursor]);
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

  const isLoading = clientsQuery.isLoading || checkinsQuery.isLoading || eventsQuery.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Coach calendar</h2>
          <p className="text-sm text-muted-foreground">
            Track check-ins due today and upcoming events.
          </p>
        </div>
        <Button
          onClick={() => {
            setEventDate(todayKey);
            setEventDialogOpen(true);
          }}
          className="gap-2"
          disabled={!workspaceId}
        >
          <Plus className="h-4 w-4" />
          Create event
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <DashboardCard
          title="Calendar"
          subtitle="All check-ins and coaching events in one place."
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-lg font-semibold text-foreground">{monthLabel}</div>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="secondary"
                onClick={() =>
                  setMonthCursor(
                    (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
                  )
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                onClick={() =>
                  setMonthCursor(
                    (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                  )
                }
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-3 text-xs text-muted-foreground">
            {"Sun Mon Tue Wed Thu Fri Sat".split(" ").map((day) => (
              <div key={day} className="text-center uppercase tracking-[0.2em]">
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
                const isToday = day.key === todayKey;
                return (
                  <div
                    key={day.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setEventDate(day.key);
                      setEventMode("create");
                      setEditingEventId(null);
                      setEventDialogOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setEventDate(day.key);
                        setEventDialogOpen(true);
                      }
                    }}
                    className={cn(
                      "min-h-[160px] rounded-2xl border border-border/70 bg-background/40 p-3 text-left transition hover:border-border",
                      !day.inMonth && "opacity-50",
                      isToday && "border-accent/60 bg-accent/10"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">
                        {day.key.slice(-2)}
                      </span>
                      {checkins.some((row) => !row.submitted_at) ? (
                        <StatusPill status="due" statusMap={statusMap} />
                      ) : null}
                    </div>

                    <div className="mt-3 space-y-2">
                      {checkins.slice(0, 2).map((row) => {
                        const client = row.client_id ? clientMap.get(row.client_id) : null;
                        const label = client?.display_name?.trim()
                          ? client.display_name
                          : "Client";
                        return (
                          <button
                            key={row.id}
                            type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (row.client_id) {
                              navigate(`/pt/clients/${row.client_id}?tab=checkins`);
                              }
                            }}
                            className="w-full rounded-lg border border-border/60 bg-muted/30 px-2 py-1 text-left text-xs transition hover:border-border"
                          >
                            <div className="font-semibold text-foreground">{label}</div>
                            <div className="text-muted-foreground">
                              {row.submitted_at ? "Check-in submitted" : "Check-in due"}
                            </div>
                          </button>
                        );
                      })}

                      {events.slice(0, 2).map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedEvent(row);
                            setEventDetailsOpen(true);
                          }}
                          className="w-full rounded-lg border border-border/60 bg-background px-2 py-1 text-left text-xs transition hover:border-border"
                        >
                          <div className="font-semibold text-foreground">{row.title}</div>
                          {row.description ? (
                            <div className="text-muted-foreground line-clamp-1">
                              {row.description}
                            </div>
                          ) : null}
                        </button>
                      ))}

                      {checkins.length + events.length === 0 ? (
                        <div className="text-xs text-muted-foreground">No items</div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DashboardCard>

        <div className="space-y-6">
          <DashboardCard title="Notes" subtitle="Upcoming events overview.">
            {isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (eventsQuery.data ?? []).length === 0 ? (
              <EmptyState
                title="No events yet"
                description="Create an event to block time for reviews or calls."
              />
            ) : (
              <div className="space-y-3">
                {(eventsQuery.data ?? []).slice(0, 5).map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      setSelectedEvent(row);
                      setEventDetailsOpen(true);
                    }}
                    className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-left transition hover:border-border"
                  >
                    <div className="text-sm font-semibold text-foreground">{row.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(row.starts_at).toLocaleString()}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </DashboardCard>
        </div>
      </div>

      <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{eventMode === "edit" ? "Edit event" : "Create event"}</DialogTitle>
            <DialogDescription>Block time for check-in reviews or coaching calls.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Title</label>
              <Input
                value={eventTitle}
                onChange={(event) => setEventTitle(event.target.value)}
                placeholder="Weekly review block"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Date</label>
                <Input
                  type="date"
                  value={eventDate}
                  onChange={(event) => setEventDate(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Start time</label>
                <Input
                  type="time"
                  value={eventStartTime}
                  onChange={(event) => setEventStartTime(event.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">End time</label>
                <Input
                  type="time"
                  value={eventEndTime}
                  onChange={(event) => setEventEndTime(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Notes</label>
              <textarea
                className="min-h-[96px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={eventDescription}
                onChange={(event) => setEventDescription(event.target.value)}
                placeholder="Optional details"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setEventDialogOpen(false)}
              disabled={isSavingEvent}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createEventMutation.mutateAsync()}
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
                <div className="text-base font-semibold text-foreground">{selectedEvent.title}</div>
              </div>
              {selectedEvent.description ? (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Notes
                  </div>
                  <div className="text-sm text-foreground">{selectedEvent.description}</div>
                </div>
              ) : null}
              {selectedEvent.ends_at ? (
                <div className="text-xs text-muted-foreground">
                  Ends at {new Date(selectedEvent.ends_at).toLocaleString()}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No event selected.</div>
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
                    const dateKey = formatDateInTimezone(selectedEvent.starts_at, null);
                    const startTime = new Date(selectedEvent.starts_at)
                      .toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })
                      .slice(0, 5);
                    const endTime = selectedEvent.ends_at
                      ? new Date(selectedEvent.ends_at)
                          .toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })
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
                  variant="destructive"
                  onClick={() => {
                    if (!selectedEvent) return;
                    const confirmed = window.confirm("Delete this event?");
                    if (!confirmed) return;
                    deleteEventMutation.mutate(selectedEvent.id);
                  }}
                  disabled={deleteEventMutation.isPending}
                >
                  {deleteEventMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
              </div>
            ) : null}
            <Button variant="secondary" onClick={() => setEventDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
