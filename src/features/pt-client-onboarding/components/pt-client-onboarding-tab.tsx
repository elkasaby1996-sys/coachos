import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../../components/ui/alert";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { EmptyState } from "../../../components/ui/coachos";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Skeleton } from "../../../components/ui/skeleton";
import { formatRelativeTime } from "../../../lib/relative-time";
import { getSupabaseErrorDetails } from "../../../lib/supabase-errors";
import type { WorkspaceClientOnboardingRow } from "../../client-onboarding/types";
import {
  formatOnboardingSource,
  getOnboardingReviewBadgeLabel,
  toDisplayText,
  type PtOnboardingChecklistItem,
} from "../lib/pt-client-onboarding";

type QueryResult<T> = {
  data?: T;
  isLoading: boolean;
  error: unknown;
};

type ClientSnapshot = {
  display_name: string | null;
  email?: string | null;
};

type BaselineEntry = {
  id: string;
  submitted_at: string | null;
};

type BaselineMetrics = {
  weight_kg: number | null;
  height_cm: number | null;
  body_fat_pct: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  hips_cm: number | null;
  thigh_cm: number | null;
  arm_cm: number | null;
  resting_hr: number | null;
  vo2max: number | null;
};

type BaselineMarkerRow = {
  value_number: number | null;
  value_text: string | null;
  template: { name: string | null; unit_label: string | null } | null;
};

type BaselinePhotoRow = {
  photo_type: string | null;
  url: string | null;
};

type BaselinePhotoViewerState = {
  type: "front" | "side" | "back";
  url: string;
};

export function PtClientOnboardingTab({
  clientSnapshot,
  onboardingQuery,
  onboardingStatusMeta,
  onboardingChecklist,
  onboardingReadyForCompletion,
  onboardingMissingItems,
  onboardingReviewNotes,
  onboardingReviewStatus,
  onboardingReviewMessage,
  onboardingActionStatus,
  onboardingActionMessage,
  baselineEntryQuery,
  baselineMetricsQuery,
  baselineMarkersQuery,
  baselinePhotosQuery,
  baselinePhotoMap,
  onReviewNotesChange,
  onSaveReviewNotes,
  onMarkReviewed,
  onComplete,
}: {
  clientSnapshot: ClientSnapshot | null;
  onboardingQuery: QueryResult<WorkspaceClientOnboardingRow | null>;
  onboardingStatusMeta: {
    label: string;
    description: string;
    variant: "success" | "warning" | "muted" | "secondary";
  };
  onboardingChecklist: PtOnboardingChecklistItem[];
  onboardingReadyForCompletion: boolean;
  onboardingMissingItems: string[];
  onboardingReviewNotes: string;
  onboardingReviewStatus: "idle" | "saving" | "error";
  onboardingReviewMessage: string | null;
  onboardingActionStatus: "idle" | "saving" | "error";
  onboardingActionMessage: string | null;
  baselineEntryQuery: QueryResult<BaselineEntry | null>;
  baselineMetricsQuery: QueryResult<BaselineMetrics | null>;
  baselineMarkersQuery: QueryResult<BaselineMarkerRow[]>;
  baselinePhotosQuery: QueryResult<BaselinePhotoRow[]>;
  baselinePhotoMap: Record<"front" | "side" | "back", string | null>;
  onReviewNotesChange: (value: string) => void;
  onSaveReviewNotes: () => void;
  onMarkReviewed: () => void;
  onComplete: () => void;
}) {
  const onboarding = onboardingQuery.data;
  const isCompleted =
    onboarding?.status === "completed" || Boolean(onboarding?.completed_at);
  const [completedNotesEditing, setCompletedNotesEditing] = useState(false);
  const [activePhoto, setActivePhoto] =
    useState<BaselinePhotoViewerState | null>(null);

  useEffect(() => {
    if (!isCompleted) {
      setCompletedNotesEditing(false);
    }
  }, [isCompleted]);

  if (onboardingQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (onboardingQuery.error) {
    return (
      <Alert className="border-destructive/30">
        <AlertTitle>Unable to load onboarding review</AlertTitle>
        <AlertDescription>
          {getSupabaseErrorDetails(onboardingQuery.error).message}
        </AlertDescription>
      </Alert>
    );
  }
  if (!onboarding) {
    return (
      <EmptyState
        title="No onboarding record found"
        description="This client does not have a workspace onboarding row yet."
      />
    );
  }

  const intakeSections = [
    {
      title: "Goals",
      rows: [
        ["Primary goal", onboarding.goals?.goal],
        ["Motivation", onboarding.goals?.motivation],
        ["Secondary goals", onboarding.goals?.secondary_goals],
      ],
    },
    {
      title: "Training history",
      rows: [
        ["Experience", onboarding.training_history?.experience_level],
        [
          "Current frequency",
          onboarding.training_history?.current_training_frequency,
        ],
        ["Equipment access", onboarding.training_history?.equipment],
        ["Days available", onboarding.training_history?.days_per_week],
      ],
    },
    {
      title: "Injuries / limitations",
      rows: [
        ["Current injuries", onboarding.injuries_limitations?.injuries],
        ["Limitations", onboarding.injuries_limitations?.limitations],
        [
          "Avoid movements",
          onboarding.injuries_limitations?.exercises_to_avoid,
        ],
        [
          "Surgeries / history",
          onboarding.injuries_limitations?.surgeries_history,
        ],
      ],
    },
    {
      title: "Nutrition & lifestyle",
      rows: [
        [
          "Dietary preferences",
          onboarding.nutrition_lifestyle?.dietary_preferences,
        ],
        ["Allergies", onboarding.nutrition_lifestyle?.allergies],
        ["Foods avoided", onboarding.nutrition_lifestyle?.foods_avoided],
        ["Sleep quality", onboarding.nutrition_lifestyle?.sleep_quality],
        ["Stress level", onboarding.nutrition_lifestyle?.stress_level],
        [
          "Schedule constraints",
          onboarding.nutrition_lifestyle?.schedule_constraints,
        ],
      ],
    },
  ] as const;

  const baselineLoading =
    baselineEntryQuery.isLoading ||
    baselineMetricsQuery.isLoading ||
    baselineMarkersQuery.isLoading ||
    baselinePhotosQuery.isLoading;

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)]">
        <div className="space-y-6">
          <Card className="border-border/70 bg-card/80">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={onboardingStatusMeta.variant}>
                  {getOnboardingReviewBadgeLabel(onboarding.status)}
                </Badge>
                <Badge variant="muted">
                  {formatOnboardingSource(onboarding.source)}
                </Badge>
              </div>
              <CardTitle>Onboarding review</CardTitle>
              <p className="text-sm text-muted-foreground">
                {isCompleted
                  ? "Onboarding is complete. This tab now acts as a read-only preview of the submitted intake and coach review."
                  : "Review the intake, confirm the initial assessment, and move this client through the remaining onboarding actions."}
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryBox
                label="Client"
                value={clientSnapshot?.display_name ?? "Client"}
                detail={toDisplayText(
                  onboarding.basics?.email ?? clientSnapshot?.email,
                  "No email saved",
                )}
              />
              <SummaryBox
                label="Started"
                value={
                  onboarding.started_at
                    ? formatRelativeTime(onboarding.started_at)
                    : "Recently"
                }
                detail={
                  onboarding.last_saved_at
                    ? `Last saved ${formatRelativeTime(onboarding.last_saved_at)}`
                    : "No draft saves yet"
                }
              />
              <SummaryBox
                label="Submitted"
                value={
                  onboarding.submitted_at
                    ? formatRelativeTime(onboarding.submitted_at)
                    : "Not submitted"
                }
                detail={
                  onboarding.reviewed_at
                    ? `Reviewed ${formatRelativeTime(onboarding.reviewed_at)}`
                    : "Review not logged yet"
                }
              />
              <SummaryBox
                label="Status"
                value={onboardingStatusMeta.label}
                detail={onboardingStatusMeta.description}
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border/70 bg-card/80">
              <CardHeader>
                <CardTitle className="text-base">Basics</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Full name", onboarding.basics?.display_name],
                  ["Phone", onboarding.basics?.phone],
                  ["Email", onboarding.basics?.email ?? clientSnapshot?.email],
                  ["Location", onboarding.basics?.location],
                  ["Timezone", onboarding.basics?.timezone],
                  ["Units", onboarding.basics?.unit_preference],
                ].map(([label, value]) => (
                  <FieldValue
                    key={String(label)}
                    label={String(label)}
                    value={value}
                  />
                ))}
              </CardContent>
            </Card>

            {intakeSections.map((section) => (
              <Card key={section.title} className="border-border/70 bg-card/80">
                <CardHeader>
                  <CardTitle className="text-base">{section.title}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {section.rows.map(([label, value]) => (
                    <FieldValue
                      key={`${section.title}-${label}`}
                      label={String(label)}
                      value={value}
                    />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">Initial assessment</CardTitle>
              <p className="text-sm text-muted-foreground">
                Submitted baseline linked to this onboarding cycle.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {baselineLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-6 w-1/2" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : baselineEntryQuery.data ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Submitted at
                      </p>
                      <p className="text-sm font-semibold">
                        {baselineEntryQuery.data.submitted_at
                          ? new Date(
                              baselineEntryQuery.data.submitted_at,
                            ).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "Submitted"}
                      </p>
                    </div>
                    <Badge variant="success">Submitted</Badge>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ["Weight", baselineMetricsQuery.data?.weight_kg, "kg"],
                      ["Height", baselineMetricsQuery.data?.height_cm, "cm"],
                      [
                        "Body fat",
                        baselineMetricsQuery.data?.body_fat_pct,
                        "%",
                      ],
                      ["Waist", baselineMetricsQuery.data?.waist_cm, "cm"],
                    ].map(([label, value, unit]) => (
                      <SummaryBox
                        key={String(label)}
                        label={String(label)}
                        value={
                          typeof value === "number"
                            ? `${value} ${unit}`
                            : "Not provided"
                        }
                      />
                    ))}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Performance markers
                    </p>
                    {baselineMarkersQuery.data &&
                    baselineMarkersQuery.data.length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {baselineMarkersQuery.data.map((marker, index) => (
                          <SummaryBox
                            key={`${marker.template?.name ?? "marker"}-${index}`}
                            label={marker.template?.name ?? "Marker"}
                            value={
                              marker.value_number !== null &&
                              marker.value_number !== undefined
                                ? `${marker.value_number}${
                                    marker.template?.unit_label
                                      ? ` ${marker.template.unit_label}`
                                      : ""
                                  }`
                                : (marker.value_text ?? "Not provided")
                            }
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No markers submitted.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Photos
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {(["front", "side", "back"] as const).map((type) => (
                        <div key={type} className="space-y-2">
                          <p className="text-xs font-semibold uppercase text-muted-foreground">
                            {type}
                          </p>
                          <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-border bg-muted/30">
                            {baselinePhotoMap[type] ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setActivePhoto({
                                    type,
                                    url: baselinePhotoMap[type] ?? "",
                                  })
                                }
                                className="group relative block h-full w-full"
                                aria-label={`Open full ${type} baseline photo`}
                              >
                                <img
                                  src={baselinePhotoMap[type] ?? ""}
                                  alt={`${type} baseline`}
                                  className="h-full w-full rounded-md object-cover transition group-hover:opacity-90"
                                />
                                <div className="pointer-events-none absolute inset-0 flex items-end justify-center rounded-md bg-gradient-to-t from-black/45 via-black/0 to-transparent px-2 py-2 opacity-0 transition group-hover:opacity-100">
                                  <span className="text-[11px] font-medium text-white">
                                    Open full photo
                                  </span>
                                </div>
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Missing
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No submitted baseline yet.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">
                {isCompleted ? "Completion summary" : "Onboarding checklist"}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {isCompleted
                  ? "A historical view of the completion criteria for this onboarding."
                  : "Completion requires the core onboarding items below. Program assignment and check-in setup now live in their own PT workflow surfaces outside onboarding."}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {onboardingChecklist.map((item) => (
                <div
                  key={item.key}
                  className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/30 px-3 py-3"
                >
                  <div className="mt-0.5">
                    {item.complete ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-warning" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {item.label}
                      </p>
                      {item.optional ? (
                        <Badge variant="muted">Optional</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                  <Badge variant={item.complete ? "success" : "warning"}>
                    {item.complete ? "Done" : "Missing"}
                  </Badge>
                </div>
              ))}
              {isCompleted ? (
                <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-foreground">
                  Onboarding completed
                  {onboarding.completed_at
                    ? ` ${formatRelativeTime(onboarding.completed_at)}`
                    : ""}
                  .
                </div>
              ) : !onboardingReadyForCompletion ? (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-foreground">
                  Completion is blocked by: {onboardingMissingItems.join(", ")}.
                </div>
              ) : (
                <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-foreground">
                  Required completion items are in place.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">
                {isCompleted ? "Coach notes" : "Coach notes & actions"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isCompleted ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border/60 bg-background/30 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Coach review notes
                      </p>
                      {completedNotesEditing ? (
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              onReviewNotesChange(
                                onboarding.coach_review_notes ?? "",
                              );
                              setCompletedNotesEditing(false);
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={async () => {
                              await onSaveReviewNotes();
                              setCompletedNotesEditing(false);
                            }}
                            disabled={onboardingReviewStatus === "saving"}
                          >
                            {onboardingReviewStatus === "saving"
                              ? "Saving..."
                              : "Save notes"}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setCompletedNotesEditing(true)}
                        >
                          Edit notes
                        </Button>
                      )}
                    </div>
                    {completedNotesEditing ? (
                      <textarea
                        className="mt-3 min-h-[140px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={onboardingReviewNotes}
                        onChange={(event) =>
                          onReviewNotesChange(event.target.value)
                        }
                        placeholder="Key coaching context, red flags, and activation notes..."
                      />
                    ) : (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                        {onboardingReviewNotes.trim() ||
                          "No coach notes saved."}
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-foreground">
                    This onboarding is complete and now shown in preview mode.
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase text-muted-foreground">
                      Coach review notes
                    </label>
                    <textarea
                      className="min-h-[140px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={onboardingReviewNotes}
                      onChange={(event) =>
                        onReviewNotesChange(event.target.value)
                      }
                      placeholder="Key coaching context, red flags, and activation notes..."
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={onSaveReviewNotes}
                      disabled={onboardingReviewStatus === "saving"}
                    >
                      {onboardingReviewStatus === "saving"
                        ? "Saving..."
                        : "Save notes"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={onMarkReviewed}
                      disabled={onboardingActionStatus === "saving"}
                    >
                      Mark reviewed
                    </Button>
                    <Button
                      onClick={onComplete}
                      disabled={
                        onboardingActionStatus === "saving" ||
                        !onboardingReadyForCompletion
                      }
                    >
                      Complete onboarding
                    </Button>
                  </div>
                </>
              )}
              {onboardingReviewMessage ? (
                <p className="text-xs text-muted-foreground">
                  {onboardingReviewMessage}
                </p>
              ) : null}
              {onboardingActionMessage ? (
                <div className="rounded-lg border border-border/60 bg-background/30 p-3 text-xs text-muted-foreground">
                  {onboardingActionMessage}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
      <Dialog
        open={activePhoto !== null}
        onOpenChange={(open) => {
          if (!open) setActivePhoto(null);
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden border-border/80 bg-[oklch(0.17_0.012_255)] p-0 shadow-[0_0_0_1px_oklch(1_0_0/0.03),0_28px_72px_-34px_rgb(0_0_0/0.85)]">
          <DialogHeader className="border-b border-border/70 px-6 py-4">
            <DialogTitle className="text-base capitalize">
              {activePhoto?.type ?? "Photo"} baseline photo
            </DialogTitle>
            <DialogDescription>
              Full-size submitted progress photo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[calc(92vh-84px)] items-center justify-center bg-black/35 p-4">
            {activePhoto ? (
              <img
                src={activePhoto.url}
                alt={`${activePhoto.type} baseline full size`}
                className="max-h-full max-w-full rounded-xl object-contain"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SummaryBox({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/35 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
      {detail ? (
        <p className="text-xs text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  );
}

function FieldValue({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="text-sm text-foreground">{toDisplayText(value)}</p>
    </div>
  );
}
