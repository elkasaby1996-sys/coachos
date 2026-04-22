import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Eye,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Select } from "../../../components/ui/select";
import { Switch } from "../../../components/ui/switch";
import { Textarea } from "../../../components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog";
import { useSessionAuth } from "../../../lib/auth";
import { formatRelativeTime } from "../../../lib/relative-time";
import {
  archivePtPackage,
  createPtPackage,
  deletePtPackage,
  getPtPackageDeleteErrorCode,
  PT_PACKAGE_DELETE_ERROR_FORBIDDEN,
  PT_PACKAGE_DELETE_ERROR_REFERENCED,
  reorderPtPackages,
  updatePtPackage,
  usePtPackageLeadReferenceCounts,
  usePtPackages,
} from "../lib/pt-hub";
import { cn } from "../../../lib/utils";
import {
  filterPackagesForManagement,
  getPackageDisplayState,
  getPackageStateHelperCopy,
  getReorderedNonArchivedPackageIds,
  normalizePackageStateForPersistence,
  PACKAGE_ARCHIVE_CONFIRMATION_LINES,
  PT_PACKAGE_FILTER_OPTIONS,
  splitPackagesByLifecycle,
  type PTPackageManagementFilter,
} from "../lib/pt-hub-package-state";
import type { PTPackage, PTPackageStatus } from "../types";
import { PtHubSectionCard } from "./pt-hub-section-card";

type PackageEditorState = {
  title: string;
  subtitle: string;
  description: string;
  priceLabel: string;
  currencyCode: string;
  billingCadenceLabel: string;
  status: PTPackageStatus;
  isPublic: boolean;
  sortOrder: number;
};

const EMPTY_PACKAGE_STATE: PackageEditorState = {
  title: "",
  subtitle: "",
  description: "",
  priceLabel: "",
  currencyCode: "",
  billingCadenceLabel: "",
  status: "draft",
  isPublic: false,
  sortOrder: 0,
};

const PACKAGE_STATUS_OPTIONS: Array<{ value: PTPackageStatus; label: string }> =
  [
    { value: "draft", label: "Draft" },
    { value: "active", label: "Active" },
    { value: "archived", label: "Archived" },
  ];

const BILLING_FREQUENCY_OPTIONS = [
  { value: "Weekly", label: "Weekly" },
  { value: "Monthly", label: "Monthly" },
  { value: "Yearly", label: "Yearly" },
  { value: "One-time", label: "One-time" },
] as const;

const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
  { value: "SAR", label: "SAR" },
  { value: "EGP", label: "EGP" },
] as const;

function normalizeBillingCadenceLabel(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return "";

  switch (normalized.toLowerCase().replace(/[\s_]+/g, "-")) {
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    case "yearly":
    case "annual":
      return "Yearly";
    case "one-time":
    case "one-time-fee":
    case "one-time-payment":
    case "onetime":
      return "One-time";
    default:
      return normalized;
  }
}

function formatPackagePriceLabel(values: {
  priceLabel: string;
  currencyCode: string;
}) {
  const priceLabel = values.priceLabel.trim();
  const currencyCode = values.currencyCode.trim().toUpperCase();
  if (!priceLabel) return null;
  if (!currencyCode) return priceLabel;
  if (priceLabel.toUpperCase().includes(currencyCode)) {
    return priceLabel;
  }
  return `${priceLabel} ${currencyCode}`;
}

function toPackageEditorState(pkg: PTPackage): PackageEditorState {
  const normalized = normalizePackageStateForPersistence({
    status: pkg.status,
    isPublic: pkg.isPublic,
  });

  return {
    title: pkg.title,
    subtitle: pkg.subtitle ?? "",
    description: pkg.description ?? "",
    priceLabel: pkg.priceLabel ?? "",
    currencyCode: pkg.currencyCode ?? "",
    billingCadenceLabel: pkg.billingCadenceLabel ?? "",
    status: normalized.status,
    isPublic: normalized.isPublic,
    sortOrder: pkg.sortOrder,
  };
}

function packageStateVariant(pkg: {
  status: PTPackageStatus;
  isPublic: boolean;
}) {
  const displayState = getPackageDisplayState(pkg);
  if (displayState === "Active • Public") return "success" as const;
  if (displayState === "Active • Hidden") return "muted" as const;
  if (displayState === "Archived") return "muted" as const;
  return "warning" as const;
}

function getPackageLastUpdatedLabel(pkg: PTPackage) {
  return formatRelativeTime(pkg.updatedAt ?? pkg.createdAt);
}

function getPackageUsageLabel(leadReferenceCount: number) {
  if (leadReferenceCount <= 0) return "Unused";
  return `Used by ${leadReferenceCount} ${
    leadReferenceCount === 1 ? "lead" : "leads"
  }`;
}

function getPackageUsageVariant(leadReferenceCount: number) {
  if (leadReferenceCount <= 0) return "neutral" as const;
  return "secondary" as const;
}

function getVisibilityPillCopy(pkg: {
  status: PTPackageStatus;
  isPublic: boolean;
}) {
  if (pkg.status !== "active") return "Public disabled";
  return pkg.isPublic ? "Public on" : "Public off";
}

function getVisibilityPillClassName(pkg: {
  status: PTPackageStatus;
  isPublic: boolean;
}) {
  if (pkg.status !== "active") {
    return "border-border/70 bg-background/60 text-muted-foreground";
  }

  return pkg.isPublic
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function coerceEditorStateByStatus(
  state: PackageEditorState,
  status: PTPackageStatus,
) {
  const normalized = normalizePackageStateForPersistence({
    status,
    isPublic: state.isPublic,
  });

  return {
    ...state,
    status: normalized.status,
    isPublic: normalized.isPublic,
  };
}

export function PtHubPackageManager() {
  const { user } = useSessionAuth();
  const queryClient = useQueryClient();
  const packagesQuery = usePtPackages();
  const packageLeadReferenceCountsQuery = usePtPackageLeadReferenceCounts();
  const packageLeadReferenceCounts = packageLeadReferenceCountsQuery.data ?? {};
  const packages = useMemo(
    () => packagesQuery.data ?? [],
    [packagesQuery.data],
  );
  const [createState, setCreateState] =
    useState<PackageEditorState>(EMPTY_PACKAGE_STATE);
  const [editStateById, setEditStateById] = useState<
    Record<string, PackageEditorState>
  >({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [activeFilter, setActiveFilter] =
    useState<PTPackageManagementFilter>("all");
  const [archiveCandidate, setArchiveCandidate] = useState<PTPackage | null>(
    null,
  );
  const [deleteCandidate, setDeleteCandidate] = useState<PTPackage | null>(
    null,
  );
  const [viewingPackageId, setViewingPackageId] = useState<string | null>(null);

  useEffect(() => {
    const nextState: Record<string, PackageEditorState> = {};
    for (const pkg of packages) {
      nextState[pkg.id] = toPackageEditorState(pkg);
    }
    setEditStateById(nextState);
  }, [packages]);

  useEffect(() => {
    if (!packages.length) {
      setCreateState((prev) => ({
        ...prev,
        sortOrder: 0,
      }));
      return;
    }

    const maxSortOrder = Math.max(...packages.map((pkg) => pkg.sortOrder));
    setCreateState((prev) => ({
      ...prev,
      sortOrder: maxSortOrder + 10,
    }));
  }, [packages]);

  async function invalidatePackageQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pt-packages", user?.id] }),
      queryClient.invalidateQueries({
        queryKey: ["pt-package-lead-reference-counts", user?.id],
      }),
      queryClient.invalidateQueries({
        queryKey: ["public-pt-package-options"],
      }),
    ]);
  }

  async function handleCreate() {
    if (!user?.id) return;

    if (!createState.title.trim()) {
      setFeedback({ tone: "error", text: "Package title is required." });
      return;
    }

    setBusyKey("create");
    setFeedback(null);
    try {
      await createPtPackage({
        ptUserId: user.id,
        input: {
          ...createState,
        },
      });
      setCreateState((prev) => ({
        ...EMPTY_PACKAGE_STATE,
        sortOrder: prev.sortOrder,
      }));
      await invalidatePackageQueries();
      setFeedback({ tone: "success", text: "Package created." });
    } catch (error) {
      setFeedback({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to create package right now.",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSave(packageId: string) {
    if (!user?.id) return;

    const editState = editStateById[packageId];
    if (!editState || !editState.title.trim()) {
      setFeedback({ tone: "error", text: "Package title is required." });
      return;
    }

    setBusyKey(`save:${packageId}`);
    setFeedback(null);
    try {
      await updatePtPackage({
        ptUserId: user.id,
        packageId,
        input: editState,
      });
      await invalidatePackageQueries();
      setFeedback({ tone: "success", text: "Package updated." });
    } catch (error) {
      setFeedback({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to update package right now.",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleArchiveConfirmed() {
    if (!user?.id || !archiveCandidate) return;

    const packageId = archiveCandidate.id;
    setBusyKey(`archive:${packageId}`);
    setFeedback(null);
    try {
      await archivePtPackage({ ptUserId: user.id, packageId });
      await invalidatePackageQueries();
      setFeedback({ tone: "success", text: "Package archived." });
      setArchiveCandidate(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to archive package right now.",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleMove(packageId: string, direction: "up" | "down") {
    if (!user?.id) return;

    const reorderedIds = getReorderedNonArchivedPackageIds({
      packages,
      packageId,
      direction,
    });

    if (!reorderedIds) return;

    setBusyKey("reorder");
    setFeedback(null);
    try {
      await reorderPtPackages({
        ptUserId: user.id,
        orderedIds: reorderedIds,
      });
      await invalidatePackageQueries();
      setFeedback({ tone: "success", text: "Package order updated." });
    } catch (error) {
      setFeedback({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to reorder packages right now.",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteCandidate) return;

    const packageId = deleteCandidate.id;
    setBusyKey(`delete:${packageId}`);
    setFeedback(null);
    try {
      await deletePtPackage({ packageId });
      await invalidatePackageQueries();
      setFeedback({ tone: "success", text: "Package deleted permanently." });
      setDeleteCandidate(null);
    } catch (error) {
      const errorCode = getPtPackageDeleteErrorCode(error);
      if (errorCode === PT_PACKAGE_DELETE_ERROR_REFERENCED) {
        setFeedback({
          tone: "error",
          text: "This package is referenced by existing leads and cannot be deleted. Archive it instead.",
        });
      } else if (errorCode === PT_PACKAGE_DELETE_ERROR_FORBIDDEN) {
        setFeedback({
          tone: "error",
          text: "You are not allowed to delete this package.",
        });
      } else {
        setFeedback({
          tone: "error",
          text:
            error instanceof Error
              ? error.message
              : "Unable to delete package right now.",
        });
      }
    } finally {
      setBusyKey(null);
    }
  }

  const filteredPackages = useMemo(
    () => filterPackagesForManagement(packages, activeFilter),
    [activeFilter, packages],
  );

  const fullReorderableIds = useMemo(
    () =>
      packages.filter((pkg) => pkg.status !== "archived").map((pkg) => pkg.id),
    [packages],
  );

  const splitFiltered = useMemo(
    () => splitPackagesByLifecycle(filteredPackages),
    [filteredPackages],
  );
  const viewingPackage = useMemo(
    () => packages.find((pkg) => pkg.id === viewingPackageId) ?? null,
    [packages, viewingPackageId],
  );

  const renderPackageRow = (pkg: PTPackage) => {
    const editState = editStateById[pkg.id] ?? toPackageEditorState(pkg);
    const leadReferenceCount = packageLeadReferenceCounts[pkg.id];
    const resolvedLeadReferenceCount = leadReferenceCount ?? 0;
    const usageLabel = getPackageUsageLabel(resolvedLeadReferenceCount);
    const isArchived = editState.status === "archived";

    return (
      <div
        key={pkg.id}
        className={cn(
          "rounded-[22px] border border-border/65 bg-background/40 px-4 py-4 transition hover:border-border hover:bg-background/55",
          isArchived && "bg-background/25 opacity-90",
        )}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground sm:text-base">
                {pkg.title}
              </p>
              <Badge variant={packageStateVariant(editState)}>
                {getPackageDisplayState(editState)}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {formatPackagePriceLabel(editState) ? (
                <span className="inline-flex items-center rounded-full border border-border/65 bg-background/75 px-2.5 py-1 font-medium text-foreground">
                  {formatPackagePriceLabel(editState)}
                </span>
              ) : null}
              {editState.billingCadenceLabel ? (
                <span className="inline-flex items-center rounded-full border border-border/65 bg-background/75 px-2.5 py-1 font-medium text-foreground">
                  {editState.billingCadenceLabel}
                </span>
              ) : null}
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-1 font-medium",
                  getVisibilityPillClassName(editState),
                )}
              >
                {getVisibilityPillCopy(editState)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>Updated {getPackageLastUpdatedLabel(pkg)}</span>
              {!packageLeadReferenceCountsQuery.isLoading ? (
                <span>{usageLabel}</span>
              ) : (
                <span>Checking usage...</span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start lg:self-center">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setViewingPackageId(pkg.id)}
            >
              <Eye className="h-4 w-4" />
              View
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {feedback ? (
        <div
          className={
            feedback.tone === "success"
              ? "rounded-2xl border border-success/20 bg-success/10 px-3 py-2 text-sm text-success"
              : "rounded-2xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"
          }
        >
          {feedback.text}
        </div>
      ) : null}

      <PtHubSectionCard
        title="Package creator"
        description="Build new PT-scoped offers for your public profile and lead intake without leaving this workspace."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            value={createState.title}
            onChange={(event) =>
              setCreateState((prev) => ({ ...prev, title: event.target.value }))
            }
            placeholder="Package title"
          />
          <Input
            value={createState.subtitle}
            onChange={(event) =>
              setCreateState((prev) => ({
                ...prev,
                subtitle: event.target.value,
              }))
            }
            placeholder="Subtitle (optional)"
          />
          <div className="grid gap-3 md:col-span-2 md:grid-cols-[minmax(0,1fr)_180px]">
            <Input
              value={createState.priceLabel}
              onChange={(event) =>
                setCreateState((prev) => ({
                  ...prev,
                  priceLabel: event.target.value,
                }))
              }
              placeholder="Price"
            />
            <Select
              value={createState.currencyCode}
              onChange={(event) =>
                setCreateState((prev) => ({
                  ...prev,
                  currencyCode: event.target.value,
                }))
              }
            >
              <option value="">Currency</option>
              {CURRENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
              {createState.currencyCode &&
              !CURRENCY_OPTIONS.some(
                (option) => option.value === createState.currencyCode,
              ) ? (
                <option value={createState.currencyCode}>
                  {createState.currencyCode}
                </option>
              ) : null}
            </Select>
          </div>
          <Select
            value={normalizeBillingCadenceLabel(createState.billingCadenceLabel)}
            onChange={(event) =>
              setCreateState((prev) => ({
                ...prev,
                billingCadenceLabel: event.target.value,
              }))
            }
          >
            <option value="">Billing frequency</option>
            {BILLING_FREQUENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            {createState.billingCadenceLabel &&
            !BILLING_FREQUENCY_OPTIONS.some(
              (option) =>
                option.value ===
                normalizeBillingCadenceLabel(createState.billingCadenceLabel),
            ) ? (
              <option
                value={normalizeBillingCadenceLabel(
                  createState.billingCadenceLabel,
                )}
              >
                {normalizeBillingCadenceLabel(createState.billingCadenceLabel)}
              </option>
            ) : null}
          </Select>
          <Select
            value={createState.status}
            onChange={(event) =>
              setCreateState((prev) =>
                coerceEditorStateByStatus(
                  prev,
                  event.target.value as PTPackageStatus,
                ),
              )
            }
          >
            {PACKAGE_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Display Order
            </span>
            <Input
              className="h-14 pt-6"
              type="number"
              min={0}
              value={createState.sortOrder}
              onChange={(event) =>
                setCreateState((prev) => ({
                  ...prev,
                  sortOrder: Number.parseInt(event.target.value, 10) || 0,
                }))
              }
              placeholder="0"
            />
          </div>
        </div>
        <Textarea
          className="min-h-[112px]"
          value={createState.description}
          onChange={(event) =>
            setCreateState((prev) => ({
              ...prev,
              description: event.target.value,
            }))
          }
          placeholder="Description (optional)"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-border/60 bg-background/35 px-4 py-3">
          <div className="space-y-1">
            <label className="inline-flex items-center gap-2 text-sm text-foreground">
              <Switch
                checked={createState.isPublic}
                disabled={createState.status !== "active"}
                onCheckedChange={(checked) =>
                  setCreateState((prev) => ({
                    ...prev,
                    isPublic: prev.status === "active" ? checked : false,
                  }))
                }
              />
              Public visibility
            </label>
            <p className="text-xs text-muted-foreground">
              {getPackageStateHelperCopy(createState)}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={busyKey === "create"}
            onClick={() => void handleCreate()}
          >
            <Plus className="h-4 w-4" />
            {busyKey === "create" ? "Creating..." : "Create package"}
          </Button>
        </div>
      </PtHubSectionCard>

      <PtHubSectionCard
        title="Packages"
      >
        <div className="flex flex-wrap items-center gap-2">
          {PT_PACKAGE_FILTER_OPTIONS.map((filter) => (
            <Button
              key={filter.value}
              type="button"
              size="sm"
              variant={activeFilter === filter.value ? "default" : "secondary"}
              onClick={() => setActiveFilter(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        {packagesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading packages...</p>
        ) : null}

        {packagesQuery.isError ? (
          <div className="rounded-2xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            Unable to load packages right now.
          </div>
        ) : null}

        {packages.length === 0 && packagesQuery.isSuccess ? (
          <div className="rounded-[20px] border border-dashed border-border/60 bg-background/30 px-4 py-5 text-sm text-muted-foreground">
            No packages yet. Create your first package to show offers on your
            public profile and capture package interest in the Apply flow.
          </div>
        ) : null}

        {splitFiltered.reorderable.length > 0 ? (
          <div className="space-y-3">
            {splitFiltered.reorderable.map((pkg) => renderPackageRow(pkg))}
          </div>
        ) : null}

        {splitFiltered.archived.length > 0 ? (
          <div className="space-y-3">
            {activeFilter === "all" ? (
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Archived packages
              </p>
            ) : null}
            {splitFiltered.archived.map((pkg) => renderPackageRow(pkg))}
          </div>
        ) : null}

        {filteredPackages.length === 0 &&
        packagesQuery.isSuccess &&
        packages.length > 0 ? (
          <div className="rounded-[20px] border border-dashed border-border/60 bg-background/30 px-4 py-5 text-sm text-muted-foreground">
            No packages match this filter.
          </div>
        ) : null}
      </PtHubSectionCard>

      <Dialog
        open={Boolean(viewingPackage)}
        onOpenChange={(open) => {
          if (!open) setViewingPackageId(null);
        }}
      >
        {viewingPackage
          ? (() => {
              const editState =
                editStateById[viewingPackage.id] ??
                toPackageEditorState(viewingPackage);
              const displayState = getPackageDisplayState(editState);
              const leadReferenceCount =
                packageLeadReferenceCounts[viewingPackage.id];
              const resolvedLeadReferenceCount = leadReferenceCount ?? 0;
              const usageLabel = getPackageUsageLabel(
                resolvedLeadReferenceCount,
              );
              const hasLeadReferences = resolvedLeadReferenceCount > 0;
              const canDelete =
                !packageLeadReferenceCountsQuery.isLoading &&
                !hasLeadReferences;
              const isBusy =
                busyKey === `save:${viewingPackage.id}` ||
                busyKey === `archive:${viewingPackage.id}` ||
                busyKey === `delete:${viewingPackage.id}`;
              const fullReorderableIndex = fullReorderableIds.indexOf(
                viewingPackage.id,
              );
              const canMoveUp = fullReorderableIndex > 0;
              const canMoveDown =
                fullReorderableIndex > -1 &&
                fullReorderableIndex < fullReorderableIds.length - 1;

              return (
                <DialogContent className="flex max-h-[90vh] w-[min(94vw,60rem)] max-w-4xl flex-col overflow-hidden p-0">
                  <div className="border-b border-border/60 px-6 py-5">
                    <DialogHeader className="pr-10">
                      <DialogTitle className="text-[1.15rem] tracking-tight">
                        {viewingPackage.title}
                      </DialogTitle>
                      <DialogDescription>
                        View package details, update its offer copy, and save
                        changes without leaving the packages list.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Badge variant={packageStateVariant(editState)}>
                        {displayState}
                      </Badge>
                      {formatPackagePriceLabel(editState) ? (
                        <span className="inline-flex items-center rounded-full border border-border/65 bg-background/70 px-2.5 py-1 text-xs font-medium text-foreground">
                          {formatPackagePriceLabel(editState)}
                        </span>
                      ) : null}
                      {editState.billingCadenceLabel ? (
                        <span className="inline-flex items-center rounded-full border border-border/65 bg-background/70 px-2.5 py-1 text-xs font-medium text-foreground">
                          {editState.billingCadenceLabel}
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                          getVisibilityPillClassName(editState),
                        )}
                      >
                        {getVisibilityPillCopy(editState)}
                      </span>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5 pb-6">
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input
                        value={editState.title}
                        onChange={(event) =>
                          setEditStateById((prev) => ({
                            ...prev,
                            [viewingPackage.id]: {
                              ...editState,
                              title: event.target.value,
                            },
                          }))
                        }
                        placeholder="Package title"
                      />
                      <Input
                        value={editState.subtitle}
                        onChange={(event) =>
                          setEditStateById((prev) => ({
                            ...prev,
                            [viewingPackage.id]: {
                              ...editState,
                              subtitle: event.target.value,
                            },
                          }))
                        }
                        placeholder="Subtitle (optional)"
                      />
                      <div className="grid gap-3 md:col-span-2 md:grid-cols-[minmax(0,1fr)_180px]">
                        <Input
                          value={editState.priceLabel}
                          onChange={(event) =>
                            setEditStateById((prev) => ({
                              ...prev,
                              [viewingPackage.id]: {
                                ...editState,
                                priceLabel: event.target.value,
                              },
                            }))
                          }
                          placeholder="Price"
                        />
                        <Select
                          value={editState.currencyCode}
                          onChange={(event) =>
                            setEditStateById((prev) => ({
                              ...prev,
                              [viewingPackage.id]: {
                                ...editState,
                                currencyCode: event.target.value,
                              },
                            }))
                          }
                        >
                          <option value="">Currency</option>
                          {CURRENCY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                          {editState.currencyCode &&
                          !CURRENCY_OPTIONS.some(
                            (option) => option.value === editState.currencyCode,
                          ) ? (
                            <option value={editState.currencyCode}>
                              {editState.currencyCode}
                            </option>
                          ) : null}
                        </Select>
                      </div>
                      <Select
                        value={normalizeBillingCadenceLabel(
                          editState.billingCadenceLabel,
                        )}
                        onChange={(event) =>
                          setEditStateById((prev) => ({
                            ...prev,
                            [viewingPackage.id]: {
                              ...editState,
                              billingCadenceLabel: event.target.value,
                            },
                          }))
                        }
                      >
                        <option value="">Billing frequency</option>
                        {BILLING_FREQUENCY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                        {editState.billingCadenceLabel &&
                        !BILLING_FREQUENCY_OPTIONS.some(
                          (option) =>
                            option.value ===
                            normalizeBillingCadenceLabel(
                              editState.billingCadenceLabel,
                            ),
                        ) ? (
                          <option
                            value={normalizeBillingCadenceLabel(
                              editState.billingCadenceLabel,
                            )}
                          >
                            {normalizeBillingCadenceLabel(
                              editState.billingCadenceLabel,
                            )}
                          </option>
                        ) : null}
                      </Select>
                      <Select
                        value={editState.status}
                        onChange={(event) =>
                          setEditStateById((prev) => ({
                            ...prev,
                            [viewingPackage.id]: coerceEditorStateByStatus(
                              editState,
                              event.target.value as PTPackageStatus,
                            ),
                          }))
                        }
                      >
                        {PACKAGE_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Display Order
                        </span>
                        <Input
                          className="h-14 pt-6"
                          type="number"
                          min={0}
                          value={editState.sortOrder}
                          onChange={(event) =>
                            setEditStateById((prev) => ({
                              ...prev,
                              [viewingPackage.id]: {
                                ...editState,
                                sortOrder:
                                  Number.parseInt(event.target.value, 10) || 0,
                              },
                            }))
                          }
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <Textarea
                      className="min-h-[128px]"
                      value={editState.description}
                      onChange={(event) =>
                        setEditStateById((prev) => ({
                          ...prev,
                          [viewingPackage.id]: {
                            ...editState,
                            description: event.target.value,
                          },
                        }))
                      }
                      placeholder="Description (optional)"
                    />

                    <div className="rounded-[24px] border border-border/60 bg-background/35 px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1">
                          <label className="inline-flex items-center gap-2 text-sm text-foreground">
                            <Switch
                              checked={editState.isPublic}
                              disabled={editState.status !== "active"}
                              onCheckedChange={(checked) =>
                                setEditStateById((prev) => ({
                                  ...prev,
                                  [viewingPackage.id]: {
                                    ...editState,
                                    isPublic:
                                      editState.status === "active"
                                        ? checked
                                        : false,
                                  },
                                }))
                              }
                            />
                            Public visibility
                          </label>
                          <p className="text-xs text-muted-foreground">
                            Only active public packages appear on your public
                            profile and Apply form.
                          </p>
                        </div>
                        <Badge
                          variant={
                            packageLeadReferenceCountsQuery.isLoading
                              ? "muted"
                              : getPackageUsageVariant(
                                  resolvedLeadReferenceCount,
                                )
                          }
                        >
                          {packageLeadReferenceCountsQuery.isLoading
                            ? "Checking usage..."
                            : usageLabel}
                        </Badge>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        {getPackageStateHelperCopy(editState)}
                      </p>
                      {packageLeadReferenceCountsQuery.isLoading ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Checking lead references before enabling delete...
                        </p>
                      ) : hasLeadReferences ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {usageLabel}. This package is referenced by existing
                          leads and cannot be permanently deleted. Archive it
                          instead.
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {usageLabel}. Delete is available because no leads
                          reference this package.
                        </p>
                      )}
                    </div>
                  </div>

                  <DialogFooter className="shrink-0 border-t border-border/60 px-6 py-4 sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busyKey === "reorder" || !canMoveUp}
                        onClick={() => void handleMove(viewingPackage.id, "up")}
                      >
                        <ArrowUp className="h-4 w-4" />
                        Up
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busyKey === "reorder" || !canMoveDown}
                        onClick={() =>
                          void handleMove(viewingPackage.id, "down")
                        }
                      >
                        <ArrowDown className="h-4 w-4" />
                        Down
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isBusy || editState.status === "archived"}
                        onClick={() => setArchiveCandidate(viewingPackage)}
                      >
                        <Archive className="h-4 w-4" />
                        Archive
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isBusy || !canDelete}
                        title={
                          canDelete
                            ? "Delete this package permanently"
                            : "This package is referenced by existing leads and cannot be permanently deleted. Archive it instead."
                        }
                        onClick={() => setDeleteCandidate(viewingPackage)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                    <Button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleSave(viewingPackage.id)}
                    >
                      <Save className="h-4 w-4" />
                      {busyKey === `save:${viewingPackage.id}`
                        ? "Saving..."
                        : "Save"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              );
            })()
          : null}
      </Dialog>

      <AlertDialog
        open={Boolean(archiveCandidate)}
        onOpenChange={(open) => {
          if (!open) setArchiveCandidate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive package?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block space-y-2">
                {PACKAGE_ARCHIVE_CONFIRMATION_LINES.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyKey !== null}>
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              disabled={busyKey !== null}
              onClick={() => void handleArchiveConfirmed()}
            >
              {archiveCandidate
                ? busyKey === `archive:${archiveCandidate.id}`
                  ? "Archiving..."
                  : "Archive package"
                : "Archive package"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteCandidate)}
        onOpenChange={(open) => {
          if (!open) setDeleteCandidate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete package permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This package will be permanently removed from PT Hub, public
              profile display, and Apply-form selection. This delete is only
              available because no leads currently reference this package.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyKey !== null}>
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              disabled={busyKey !== null}
              onClick={() => void handleDeleteConfirmed()}
            >
              {deleteCandidate
                ? busyKey === `delete:${deleteCandidate.id}`
                  ? "Deleting..."
                  : "Delete package"
                : "Delete package"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
