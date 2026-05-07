import {
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
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

function PackageFormField({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: (props: { id: string; "aria-describedby"?: string }) => ReactNode;
}) {
  const fieldId = useId();
  const hintId = hint ? `${fieldId}-hint` : undefined;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={fieldId} className="text-xs text-muted-foreground">
          {label}
        </Label>
        {required ? (
          <span className="text-[11px] font-medium text-muted-foreground">
            Required
          </span>
        ) : null}
      </div>
      {children({
        id: fieldId,
        "aria-describedby": hintId,
      })}
      {hint ? (
        <p id={hintId} className="text-xs leading-5 text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
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
  const [packageSearchValue, setPackageSearchValue] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [archiveCandidate, setArchiveCandidate] = useState<PTPackage | null>(
    null,
  );
  const [deleteCandidate, setDeleteCandidate] = useState<PTPackage | null>(
    null,
  );
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [dirtyEditPackageIds, setDirtyEditPackageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const dirtyEditPackageIdsRef = useRef(dirtyEditPackageIds);

  useEffect(() => {
    const packageIds = new Set(packages.map((pkg) => pkg.id));

    updateDirtyEditPackageIds((prev) => {
      const next = new Set(prev);
      for (const packageId of prev) {
        if (!packageIds.has(packageId)) {
          next.delete(packageId);
        }
      }
      return next.size === prev.size ? prev : next;
    });

    setEditStateById((prev) => {
      const nextState: Record<string, PackageEditorState> = {};
      const dirtyIds = dirtyEditPackageIdsRef.current;

      for (const pkg of packages) {
        const currentState = prev[pkg.id];
        if (currentState && dirtyIds.has(pkg.id)) {
          nextState[pkg.id] = currentState;
        } else {
          nextState[pkg.id] = toPackageEditorState(pkg);
        }
      }

      return nextState;
    });
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

  function updateDirtyEditPackageIds(
    update: (current: Set<string>) => Set<string>,
  ) {
    setDirtyEditPackageIds((prev) => {
      const next = update(prev);
      dirtyEditPackageIdsRef.current = next;
      return next;
    });
  }

  function updatePackageEditState(
    packageId: string,
    update: (current: PackageEditorState) => PackageEditorState,
  ) {
    const pkg = packages.find((item) => item.id === packageId);

    updateDirtyEditPackageIds((prev) => {
      const next = new Set(prev);
      next.add(packageId);
      return next;
    });
    setEditStateById((prev) => {
      const current =
        prev[packageId] ?? (pkg ? toPackageEditorState(pkg) : null);
      if (!current) return prev;

      return {
        ...prev,
        [packageId]: update(current),
      };
    });
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
      setIsCreating(false);
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
      updateDirtyEditPackageIds((prev) => {
        const next = new Set(prev);
        next.delete(packageId);
        return next;
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

  async function handleToggleVisibility(packageId: string, isPublic: boolean) {
    if (!user?.id) return;

    const pkg = packages.find((item) => item.id === packageId);
    if (!pkg || pkg.status !== "active") return;

    const editState = editStateById[packageId] ?? toPackageEditorState(pkg);
    const nextState = {
      ...editState,
      isPublic,
    };

    setBusyKey(`visibility:${packageId}`);
    setFeedback(null);
    try {
      await updatePtPackage({
        ptUserId: user.id,
        packageId,
        input: nextState,
      });
      setEditStateById((prev) => ({
        ...prev,
        [packageId]: nextState,
      }));
      await invalidatePackageQueries();
      setFeedback({
        tone: "success",
        text: isPublic ? "Package is public." : "Package is hidden.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to update package visibility right now.",
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

  const filteredPackages = useMemo(() => {
    const filteredByState = filterPackagesForManagement(packages, activeFilter);
    const normalizedSearch = packageSearchValue.trim().toLowerCase();

    if (!normalizedSearch) return filteredByState;

    return filteredByState.filter((pkg) =>
      [
        pkg.title,
        pkg.subtitle ?? "",
        pkg.description ?? "",
        pkg.priceLabel ?? "",
        pkg.billingCadenceLabel ?? "",
        getPackageDisplayState(pkg),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [activeFilter, packageSearchValue, packages]);

  const fullReorderableIds = useMemo(
    () =>
      packages.filter((pkg) => pkg.status !== "archived").map((pkg) => pkg.id),
    [packages],
  );

  const splitFiltered = useMemo(
    () => splitPackagesByLifecycle(filteredPackages),
    [filteredPackages],
  );
  const editingPackage = useMemo(
    () => packages.find((pkg) => pkg.id === editingPackageId) ?? null,
    [packages, editingPackageId],
  );

  const renderPackageRow = (pkg: PTPackage) => {
    const editState = editStateById[pkg.id] ?? toPackageEditorState(pkg);
    const leadReferenceCount = packageLeadReferenceCounts[pkg.id];
    const resolvedLeadReferenceCount = leadReferenceCount ?? 0;
    const usageLabel = getPackageUsageLabel(resolvedLeadReferenceCount);
    const isArchived = editState.status === "archived";
    const fullReorderableIndex = fullReorderableIds.indexOf(pkg.id);
    const canMoveUp = fullReorderableIndex > 0;
    const canMoveDown =
      fullReorderableIndex > -1 &&
      fullReorderableIndex < fullReorderableIds.length - 1;
    const visibilityBusy = busyKey === `visibility:${pkg.id}`;
    const isVisibilityDisabled =
      editState.status !== "active" || visibilityBusy || busyKey === "reorder";

    return (
      <div
        key={pkg.id}
        className={cn(
          "rounded-[22px] border border-border/65 bg-background/40 px-4 py-4 transition hover:border-border hover:bg-background/55",
          isArchived && "bg-background/25 opacity-90",
        )}
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
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
          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <label className="inline-flex h-9 items-center gap-2 rounded-full border border-border/60 bg-background/55 px-2.5 text-xs font-medium text-foreground">
              <Switch
                checked={editState.isPublic}
                disabled={isVisibilityDisabled}
                onCheckedChange={(checked) =>
                  void handleToggleVisibility(pkg.id, checked)
                }
              />
              Public
            </label>
            <div className="inline-flex h-9 items-center rounded-full border border-border/60 bg-background/55 p-0.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 rounded-full p-0"
                disabled={busyKey === "reorder" || !canMoveUp}
                onClick={() => void handleMove(pkg.id, "up")}
                aria-label={`Move ${pkg.title} up`}
              >
                <ArrowUp className="h-4 w-4" />
                <span className="sr-only">Move up</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 rounded-full p-0"
                disabled={busyKey === "reorder" || !canMoveDown}
                onClick={() => void handleMove(pkg.id, "down")}
                aria-label={`Move ${pkg.title} down`}
              >
                <ArrowDown className="h-4 w-4" />
                <span className="sr-only">Move down</span>
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-9 rounded-full px-3"
              onClick={() => setEditingPackageId(pkg.id)}
            >
              <Pencil className="h-4 w-4" />
              Edit
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
        title="Packages"
        description="Manage offer status, visibility, order, and package copy from one working list."
        actions={
          <Button
            type="button"
            size="sm"
            onClick={() => setIsCreating((current) => !current)}
          >
            <Plus className="h-4 w-4" />
            {isCreating ? "Close creator" : "New package"}
          </Button>
        }
      >
        <div className="app-filter-grid pt-hub-management-toolbar">
          <div className="app-filter-search space-y-1.5">
            <Label
              htmlFor="package-search"
              className="text-xs font-medium text-muted-foreground"
            >
              Search
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground [stroke-width:1.7]" />
              <Input
                id="package-search"
                className="app-filter-control pl-9"
                value={packageSearchValue}
                onChange={(event) => setPackageSearchValue(event.target.value)}
                placeholder="Search offers, pricing, or package copy"
              />
            </div>
          </div>
          <div className="app-filter-control-sm space-y-1.5">
            <Label
              htmlFor="package-state-filter"
              className="text-xs font-medium text-muted-foreground"
            >
              Status
            </Label>
            <Select
              id="package-state-filter"
              size="sm"
              variant="filter"
              className="app-filter-control"
              value={activeFilter}
              onChange={(event) =>
                setActiveFilter(event.target.value as PTPackageManagementFilter)
              }
            >
              {PT_PACKAGE_FILTER_OPTIONS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </Select>
          </div>
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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-dashed border-border/60 bg-background/30 px-4 py-5 text-sm text-muted-foreground">
            <span>
              No packages yet. Create your first offer to show on your public
              profile and capture package interest in the Apply flow.
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setIsCreating(true)}
            >
              <Plus className="h-4 w-4" />
              Create package
            </Button>
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
              <p className="text-xs font-semibold normal-case tracking-normal text-muted-foreground">
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
            No packages match the current search or filter.
          </div>
        ) : null}
      </PtHubSectionCard>

      {isCreating ? (
        <PtHubSectionCard
          title="New package"
          description="Add the offer details, then decide whether it should appear publicly."
          actions={
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setIsCreating(false)}
            >
              Close
            </Button>
          }
        >
          <div className="app-form-grid">
            <PackageFormField
              className="app-form-col-6"
              label="Package title"
              required
            >
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  value={createState.title}
                  onChange={(event) =>
                    setCreateState((prev) => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Online coaching intensive"
                />
              )}
            </PackageFormField>
            <PackageFormField className="app-form-col-6" label="Subtitle">
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  value={createState.subtitle}
                  onChange={(event) =>
                    setCreateState((prev) => ({
                      ...prev,
                      subtitle: event.target.value,
                    }))
                  }
                  placeholder="12-week transformation plan"
                />
              )}
            </PackageFormField>
            <PackageFormField className="app-form-col-3" label="Price">
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  value={createState.priceLabel}
                  onChange={(event) =>
                    setCreateState((prev) => ({
                      ...prev,
                      priceLabel: event.target.value,
                    }))
                  }
                  placeholder="250"
                />
              )}
            </PackageFormField>
            <PackageFormField className="app-form-col-2" label="Currency">
              {(fieldProps) => (
                <Select
                  {...fieldProps}
                  value={createState.currencyCode}
                  onChange={(event) =>
                    setCreateState((prev) => ({
                      ...prev,
                      currencyCode: event.target.value,
                    }))
                  }
                >
                  <option value="">Select currency</option>
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
              )}
            </PackageFormField>
            <PackageFormField
              className="app-form-col-3"
              label="Billing frequency"
            >
              {(fieldProps) => (
                <Select
                  {...fieldProps}
                  value={normalizeBillingCadenceLabel(
                    createState.billingCadenceLabel,
                  )}
                  onChange={(event) =>
                    setCreateState((prev) => ({
                      ...prev,
                      billingCadenceLabel: event.target.value,
                    }))
                  }
                >
                  <option value="">Select frequency</option>
                  {BILLING_FREQUENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                  {createState.billingCadenceLabel &&
                  !BILLING_FREQUENCY_OPTIONS.some(
                    (option) =>
                      option.value ===
                      normalizeBillingCadenceLabel(
                        createState.billingCadenceLabel,
                      ),
                  ) ? (
                    <option
                      value={normalizeBillingCadenceLabel(
                        createState.billingCadenceLabel,
                      )}
                    >
                      {normalizeBillingCadenceLabel(
                        createState.billingCadenceLabel,
                      )}
                    </option>
                  ) : null}
                </Select>
              )}
            </PackageFormField>
            <PackageFormField className="app-form-col-2" label="Status">
              {(fieldProps) => (
                <Select
                  {...fieldProps}
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
              )}
            </PackageFormField>
            <PackageFormField
              className="app-form-col-2"
              label="Display order"
              hint="Lower numbers appear first."
            >
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  type="number"
                  min={0}
                  value={createState.sortOrder}
                  onChange={(event) =>
                    setCreateState((prev) => ({
                      ...prev,
                      sortOrder: Number.parseInt(event.target.value, 10) || 0,
                    }))
                  }
                  placeholder="10"
                />
              )}
            </PackageFormField>
            <PackageFormField
              className="app-form-col-12"
              label="Description"
              hint="Use client-facing copy for the public profile and Apply flow."
            >
              {(fieldProps) => (
                <Textarea
                  {...fieldProps}
                  className="min-h-[104px]"
                  value={createState.description}
                  onChange={(event) =>
                    setCreateState((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Describe who this package is for and what it includes."
                />
              )}
            </PackageFormField>
          </div>
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
      ) : null}

      <Dialog
        open={Boolean(editingPackage)}
        onOpenChange={(open) => {
          if (!open) setEditingPackageId(null);
        }}
      >
        {editingPackage
          ? (() => {
              const editState =
                editStateById[editingPackage.id] ??
                toPackageEditorState(editingPackage);
              const displayState = getPackageDisplayState(editState);
              const leadReferenceCount =
                packageLeadReferenceCounts[editingPackage.id];
              const resolvedLeadReferenceCount = leadReferenceCount ?? 0;
              const usageLabel = getPackageUsageLabel(
                resolvedLeadReferenceCount,
              );
              const hasLeadReferences = resolvedLeadReferenceCount > 0;
              const canDelete =
                !packageLeadReferenceCountsQuery.isLoading &&
                !hasLeadReferences;
              const isBusy =
                busyKey === `save:${editingPackage.id}` ||
                busyKey === `archive:${editingPackage.id}` ||
                busyKey === `delete:${editingPackage.id}`;
              const fullReorderableIndex = fullReorderableIds.indexOf(
                editingPackage.id,
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
                        {editingPackage.title}
                      </DialogTitle>
                      <DialogDescription>
                        Edit package details, update its offer copy, and save
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
                    <div className="app-form-grid">
                      <PackageFormField
                        className="app-form-col-6"
                        label="Package title"
                        required
                      >
                        {(fieldProps) => (
                          <Input
                            {...fieldProps}
                            value={editState.title}
                            onChange={(event) =>
                              updatePackageEditState(
                                editingPackage.id,
                                (current) => ({
                                  ...current,
                                  title: event.target.value,
                                }),
                              )
                            }
                            placeholder="Online coaching intensive"
                          />
                        )}
                      </PackageFormField>
                      <PackageFormField
                        className="app-form-col-6"
                        label="Subtitle"
                      >
                        {(fieldProps) => (
                          <Input
                            {...fieldProps}
                            value={editState.subtitle}
                            onChange={(event) =>
                              updatePackageEditState(
                                editingPackage.id,
                                (current) => ({
                                  ...current,
                                  subtitle: event.target.value,
                                }),
                              )
                            }
                            placeholder="12-week transformation plan"
                          />
                        )}
                      </PackageFormField>
                      <PackageFormField
                        className="app-form-col-3"
                        label="Price"
                      >
                        {(fieldProps) => (
                          <Input
                            {...fieldProps}
                            value={editState.priceLabel}
                            onChange={(event) =>
                              updatePackageEditState(
                                editingPackage.id,
                                (current) => ({
                                  ...current,
                                  priceLabel: event.target.value,
                                }),
                              )
                            }
                            placeholder="250"
                          />
                        )}
                      </PackageFormField>
                      <PackageFormField
                        className="app-form-col-2"
                        label="Currency"
                      >
                        {(fieldProps) => (
                          <Select
                            {...fieldProps}
                            value={editState.currencyCode}
                            onChange={(event) =>
                              updatePackageEditState(
                                editingPackage.id,
                                (current) => ({
                                  ...current,
                                  currencyCode: event.target.value,
                                }),
                              )
                            }
                          >
                            <option value="">Select currency</option>
                            {CURRENCY_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                            {editState.currencyCode &&
                            !CURRENCY_OPTIONS.some(
                              (option) =>
                                option.value === editState.currencyCode,
                            ) ? (
                              <option value={editState.currencyCode}>
                                {editState.currencyCode}
                              </option>
                            ) : null}
                          </Select>
                        )}
                      </PackageFormField>
                      <PackageFormField
                        className="app-form-col-3"
                        label="Billing frequency"
                      >
                        {(fieldProps) => (
                          <Select
                            {...fieldProps}
                            value={normalizeBillingCadenceLabel(
                              editState.billingCadenceLabel,
                            )}
                            onChange={(event) =>
                              updatePackageEditState(
                                editingPackage.id,
                                (current) => ({
                                  ...current,
                                  billingCadenceLabel: event.target.value,
                                }),
                              )
                            }
                          >
                            <option value="">Select frequency</option>
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
                        )}
                      </PackageFormField>
                      <PackageFormField
                        className="app-form-col-2"
                        label="Status"
                      >
                        {(fieldProps) => (
                          <Select
                            {...fieldProps}
                            value={editState.status}
                            onChange={(event) =>
                              updatePackageEditState(
                                editingPackage.id,
                                (current) =>
                                  coerceEditorStateByStatus(
                                    current,
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
                        )}
                      </PackageFormField>
                      <PackageFormField
                        className="app-form-col-2"
                        label="Display order"
                        hint="Lower numbers appear first."
                      >
                        {(fieldProps) => (
                          <Input
                            {...fieldProps}
                            type="number"
                            min={0}
                            value={editState.sortOrder}
                            onChange={(event) =>
                              updatePackageEditState(
                                editingPackage.id,
                                (current) => ({
                                  ...current,
                                  sortOrder:
                                    Number.parseInt(event.target.value, 10) ||
                                    0,
                                }),
                              )
                            }
                            placeholder="10"
                          />
                        )}
                      </PackageFormField>

                      <PackageFormField
                        className="app-form-col-12"
                        label="Description"
                        hint="Use client-facing copy for the public profile and Apply flow."
                      >
                        {(fieldProps) => (
                          <Textarea
                            {...fieldProps}
                            className="min-h-[104px]"
                            value={editState.description}
                            onChange={(event) =>
                              updatePackageEditState(
                                editingPackage.id,
                                (current) => ({
                                  ...current,
                                  description: event.target.value,
                                }),
                              )
                            }
                            placeholder="Describe who this package is for and what it includes."
                          />
                        )}
                      </PackageFormField>
                    </div>

                    <div className="rounded-[24px] border border-border/60 bg-background/35 px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1">
                          <label className="inline-flex items-center gap-2 text-sm text-foreground">
                            <Switch
                              checked={editState.isPublic}
                              disabled={editState.status !== "active"}
                              onCheckedChange={(checked) =>
                                updatePackageEditState(
                                  editingPackage.id,
                                  (current) => ({
                                    ...current,
                                    isPublic:
                                      current.status === "active"
                                        ? checked
                                        : false,
                                  }),
                                )
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
                        onClick={() => void handleMove(editingPackage.id, "up")}
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
                          void handleMove(editingPackage.id, "down")
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
                        onClick={() => setArchiveCandidate(editingPackage)}
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
                        onClick={() => setDeleteCandidate(editingPackage)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                    <Button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleSave(editingPackage.id)}
                    >
                      <Save className="h-4 w-4" />
                      {busyKey === `save:${editingPackage.id}`
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
