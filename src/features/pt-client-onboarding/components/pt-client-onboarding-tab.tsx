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
import { getSupabaseErrorDetails } from "../../../lib/supabase-errors";
import { cn } from "../../../lib/utils";
import type { WorkspaceClientOnboardingRow } from "../../client-onboarding/types";
import {
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

  const baselineLoading =
    baselineEntryQuery.isLoading ||
    baselineMetricsQuery.isLoading ||
    baselinePhotosQuery.isLoading;
  const baselineMeasurementRows: [string, string][] = [
    ["Weight", formatMetricValue(baselineMetricsQuery.data?.weight_kg, "kg")],
    ["Height", formatMetricValue(baselineMetricsQuery.data?.height_cm, "cm")],
    [
      "Body fat",
      formatMetricValue(baselineMetricsQuery.data?.body_fat_pct, "%"),
    ],
    ["Waist", formatMetricValue(baselineMetricsQuery.data?.waist_cm, "cm")],
  ];

  return (
    <>
      <div className="space-y-5">
        <Card className="border-border/70 bg-card/80">
          <CardHeader className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.58fr)]">
              <div className="space-y-2">
                <CardTitle>Onboarding review</CardTitle>
                <p className="max-w-3xl text-sm text-muted-foreground">
                  {isCompleted
                    ? "Onboarding is complete. Use this tab as the archived intake, assessment, and coach review record."
                    : "Review the intake, confirm the initial assessment, and clear the remaining onboarding actions."}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/25 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {isCompleted ? "Completion record" : "Required items"}
                </p>
                <div className="mt-3 space-y-2">
                  {onboardingChecklist.map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {item.complete ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                        )}
                        <span className="truncate text-sm font-medium text-foreground">
                          {item.label}
                        </span>
                      </div>
                      <Badge variant={item.complete ? "success" : "warning"}>
                        {item.complete ? "Done" : "Missing"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {!isCompleted && !onboardingReadyForCompletion ? (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-foreground">
            Completion is blocked by: {onboardingMissingItems.join(", ")}.
          </div>
        ) : !isCompleted ? (
          <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-foreground">
            Required completion items are in place.
          </div>
        ) : null}
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Intake record
            </p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">
              Client onboarding snapshot
            </h3>
          </div>
          <p className="max-w-lg text-sm text-muted-foreground">
            Archived intake details, coaching notes, and initial assessment in
            one review grid.
          </p>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          <ReviewSectionCard
            title="Basics"
            eyebrow="Identity"
            rows={[
              ["Full name", onboarding.basics?.display_name],
              ["Phone", onboarding.basics?.phone],
              ["Email", onboarding.basics?.email ?? clientSnapshot?.email],
              ["Location", onboarding.basics?.location],
              ["Timezone", onboarding.basics?.timezone],
              ["Units", onboarding.basics?.unit_preference],
              ...baselineMeasurementRows,
            ]}
          />

          <ReviewSectionCard
            title="Goals"
            eyebrow="Direction"
            rows={[
              ["Primary goal", onboarding.goals?.goal],
              ["Motivation", onboarding.goals?.motivation],
              ["Secondary goals", onboarding.goals?.secondary_goals],
            ]}
          />

          <CoachReviewCard
            isCompleted={isCompleted}
            completedNotesEditing={completedNotesEditing}
            onboarding={onboarding}
            onboardingReviewNotes={onboardingReviewNotes}
            onboardingReviewStatus={onboardingReviewStatus}
            onboardingReviewMessage={onboardingReviewMessage}
            onboardingActionStatus={onboardingActionStatus}
            onboardingActionMessage={onboardingActionMessage}
            onboardingReadyForCompletion={onboardingReadyForCompletion}
            onReviewNotesChange={onReviewNotesChange}
            onSaveReviewNotes={onSaveReviewNotes}
            onMarkReviewed={onMarkReviewed}
            onComplete={onComplete}
            onCompletedNotesEditingChange={setCompletedNotesEditing}
          />

          <ReviewSectionCard
            title="Training history"
            eyebrow="Training"
            rows={[
              ["Experience", onboarding.training_history?.experience_level],
              [
                "Current frequency",
                onboarding.training_history?.current_training_frequency,
              ],
              ["Equipment access", onboarding.training_history?.equipment],
              ["Days available", onboarding.training_history?.days_per_week],
            ]}
          />

          <ReviewSectionCard
            title="Injuries / limitations"
            eyebrow="Constraints"
            rows={[
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
            ]}
          />

          <ReviewSectionCard
            title="Nutrition & lifestyle"
            eyebrow="Lifestyle"
            rows={[
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
            ]}
            columns="three"
          />

          <Card className="border-border/70 bg-card/80 lg:col-span-2 2xl:col-span-3">
            <CardContent className="space-y-4 pt-5">
              {baselineLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-6 w-1/2" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : baselineEntryQuery.data ? (
                <>
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
                          <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border bg-muted/30">
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
                <EmptyState
                  title="No initial assessment submitted yet"
                  description="This client has not sent baseline measurements or photos yet. The initial assessment will appear here once the baseline is submitted."
                />
              )}
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

function formatMetricValue(value: number | null | undefined, unit: string) {
  return typeof value === "number" ? `${value} ${unit}` : "Not provided";
}

function ReviewSectionCard({
  eyebrow,
  title,
  rows,
  className,
  columns = "two",
}: {
  eyebrow?: string;
  title: string;
  rows: readonly (readonly [string, unknown])[];
  className?: string;
  columns?: "two" | "three";
}) {
  return (
    <Card
      className={cn(
        "h-full border-border/70 bg-card/80 shadow-[0_18px_50px_-38px_rgb(15_23_42/0.55)]",
        className,
      )}
    >
      <CardHeader className="space-y-1 border-b border-border/45 pb-3">
        {eyebrow ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <CardTitle className="text-[0.98rem]">{title}</CardTitle>
      </CardHeader>
      <CardContent
        className={cn(
          "grid gap-x-5 gap-y-0 p-0",
          columns === "three"
            ? "sm:grid-cols-2 xl:grid-cols-3"
            : "sm:grid-cols-2",
        )}
      >
        {rows.map(([label, value], index) => (
          <FieldValue
            key={`${title}-${label}`}
            label={label}
            value={value}
            isLast={index === rows.length - 1}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function CoachReviewCard({
  className,
  isCompleted,
  completedNotesEditing,
  onboarding,
  onboardingReviewNotes,
  onboardingReviewStatus,
  onboardingReviewMessage,
  onboardingActionStatus,
  onboardingActionMessage,
  onboardingReadyForCompletion,
  onReviewNotesChange,
  onSaveReviewNotes,
  onMarkReviewed,
  onComplete,
  onCompletedNotesEditingChange,
}: {
  className?: string;
  isCompleted: boolean;
  completedNotesEditing: boolean;
  onboarding: WorkspaceClientOnboardingRow;
  onboardingReviewNotes: string;
  onboardingReviewStatus: "idle" | "saving" | "error";
  onboardingReviewMessage: string | null;
  onboardingActionStatus: "idle" | "saving" | "error";
  onboardingActionMessage: string | null;
  onboardingReadyForCompletion: boolean;
  onReviewNotesChange: (value: string) => void;
  onSaveReviewNotes: () => void;
  onMarkReviewed: () => void;
  onComplete: () => void;
  onCompletedNotesEditingChange: (value: boolean) => void;
}) {
  return (
    <Card
      className={cn(
        "h-full border-border/70 bg-card/80 shadow-[0_24px_70px_-44px_rgb(15_23_42/0.7)]",
        className,
      )}
    >
      <CardHeader className="space-y-1 border-b border-border/45 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Coach layer
        </p>
        <CardTitle className="text-[0.98rem]">
          {isCompleted ? "Coach notes" : "Coach notes & actions"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {isCompleted ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-border/60 bg-background/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] font-medium text-muted-foreground">
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
                        onCompletedNotesEditingChange(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={async () => {
                        await onSaveReviewNotes();
                        onCompletedNotesEditingChange(false);
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
                    onClick={() => onCompletedNotesEditingChange(true)}
                  >
                    Edit notes
                  </Button>
                )}
              </div>
              {completedNotesEditing ? (
                <textarea
                  className="mt-3 min-h-[180px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={onboardingReviewNotes}
                  onChange={(event) => onReviewNotesChange(event.target.value)}
                  placeholder="Key coaching context, red flags, and activation notes..."
                />
              ) : (
                <p className="mt-2 min-h-[110px] whitespace-pre-wrap text-sm text-foreground">
                  {onboardingReviewNotes.trim() || "No coach notes saved."}
                </p>
              )}
            </div>
            <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-foreground">
              This onboarding is complete and now shown in preview mode.
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2.5">
              <label className="text-[11px] font-medium text-muted-foreground">
                Coach review notes
              </label>
              <textarea
                className="min-h-[180px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={onboardingReviewNotes}
                onChange={(event) => onReviewNotesChange(event.target.value)}
                placeholder="Key coaching context, red flags, and activation notes..."
              />
            </div>
            <div className="rounded-xl border border-border/60 bg-background/25 p-3">
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
  );
}

function FieldValue({
  label,
  value,
  isLast = false,
}: {
  label: string;
  value: unknown;
  isLast?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 border-border/45 px-4 py-3",
        !isLast && "border-b",
      )}
    >
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-foreground">
        {toDisplayText(value)}
      </p>
    </div>
  );
}
