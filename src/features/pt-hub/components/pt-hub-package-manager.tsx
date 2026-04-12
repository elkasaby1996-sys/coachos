import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Select } from "../../../components/ui/select";
import { Switch } from "../../../components/ui/switch";
import { Textarea } from "../../../components/ui/textarea";
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

type PackageEditorState = {
  title: string;
  subtitle: string;
  description: string;
  priceLabel: string;
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
  billingCadenceLabel: "",
  status: "draft",
  isPublic: false,
  sortOrder: 0,
};

const PACKAGE_STATUS_OPTIONS: Array<{ value: PTPackageStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

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
    billingCadenceLabel: pkg.billingCadenceLabel ?? "",
    status: normalized.status,
    isPublic: normalized.isPublic,
    sortOrder: pkg.sortOrder,
  };
}

function packageStateVariant(pkg: { status: PTPackageStatus; isPublic: boolean }) {
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
  const packages = useMemo(() => packagesQuery.data ?? [], [packagesQuery.data]);
  const [createState, setCreateState] = useState<PackageEditorState>(
    EMPTY_PACKAGE_STATE,
  );
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
  const [archiveCandidate, setArchiveCandidate] = useState<PTPackage | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<PTPackage | null>(null);

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
      queryClient.invalidateQueries({ queryKey: ["public-pt-package-options"] }),
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

      <div className="rounded-[20px] border border-border/60 bg-background/35 p-4">
        <p className="text-sm font-medium text-foreground">Create package</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Packages appear on your public profile and support Apply-form package
          selection. This is not a billing product.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
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
              setCreateState((prev) => ({ ...prev, subtitle: event.target.value }))
            }
            placeholder="Subtitle (optional)"
          />
          <Input
            value={createState.priceLabel}
            onChange={(event) =>
              setCreateState((prev) => ({ ...prev, priceLabel: event.target.value }))
            }
            placeholder="Price label (optional)"
          />
          <Input
            value={createState.billingCadenceLabel}
            onChange={(event) =>
              setCreateState((prev) => ({
                ...prev,
                billingCadenceLabel: event.target.value,
              }))
            }
            placeholder="Billing cadence label (optional)"
          />
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
          <Input
            type="number"
            min={0}
            value={createState.sortOrder}
            onChange={(event) =>
              setCreateState((prev) => ({
                ...prev,
                sortOrder: Number.parseInt(event.target.value, 10) || 0,
              }))
            }
            placeholder="Sort order"
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
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
        <p className="mt-2 text-xs text-muted-foreground">
          {getPackageStateHelperCopy(createState)}
        </p>
        <Textarea
          className="mt-3 min-h-[96px]"
          value={createState.description}
          onChange={(event) =>
            setCreateState((prev) => ({ ...prev, description: event.target.value }))
          }
          placeholder="Description (optional)"
        />
      </div>

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

      {splitFiltered.reorderable.map((pkg) => {
        const editState = editStateById[pkg.id] ?? toPackageEditorState(pkg);
        const displayState = getPackageDisplayState(editState);
        const leadReferenceCount = packageLeadReferenceCounts[pkg.id];
        const resolvedLeadReferenceCount = leadReferenceCount ?? 0;
        const usageLabel = getPackageUsageLabel(resolvedLeadReferenceCount);
        const hasLeadReferences = resolvedLeadReferenceCount > 0;
        const canDelete =
          !packageLeadReferenceCountsQuery.isLoading && !hasLeadReferences;
        const isBusy =
          busyKey === `save:${pkg.id}` ||
          busyKey === `archive:${pkg.id}` ||
          busyKey === `delete:${pkg.id}`;
        const fullReorderableIndex = fullReorderableIds.indexOf(pkg.id);
        const canMoveUp = fullReorderableIndex > 0;
        const canMoveDown =
          fullReorderableIndex > -1 &&
          fullReorderableIndex < fullReorderableIds.length - 1;

        return (
          <div
            key={pkg.id}
            className="rounded-[20px] border border-border/60 bg-background/35 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{pkg.title}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    packageLeadReferenceCountsQuery.isLoading
                      ? "muted"
                      : getPackageUsageVariant(resolvedLeadReferenceCount)
                  }
                >
                  {packageLeadReferenceCountsQuery.isLoading
                    ? "Checking usage..."
                    : usageLabel}
                </Badge>
                <Badge variant={packageStateVariant(editState)}>{displayState}</Badge>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>Display order {pkg.sortOrder}</span>
              <span>Updated {getPackageLastUpdatedLabel(pkg)}</span>
              {!packageLeadReferenceCountsQuery.isLoading ? (
                <span>{usageLabel}</span>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {getPackageStateHelperCopy(editState)}
            </p>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Input
                value={editState.title}
                onChange={(event) =>
                  setEditStateById((prev) => ({
                    ...prev,
                    [pkg.id]: { ...editState, title: event.target.value },
                  }))
                }
                placeholder="Package title"
              />
              <Input
                value={editState.subtitle}
                onChange={(event) =>
                  setEditStateById((prev) => ({
                    ...prev,
                    [pkg.id]: { ...editState, subtitle: event.target.value },
                  }))
                }
                placeholder="Subtitle (optional)"
              />
              <Input
                value={editState.priceLabel}
                onChange={(event) =>
                  setEditStateById((prev) => ({
                    ...prev,
                    [pkg.id]: { ...editState, priceLabel: event.target.value },
                  }))
                }
                placeholder="Price label (optional)"
              />
              <Input
                value={editState.billingCadenceLabel}
                onChange={(event) =>
                  setEditStateById((prev) => ({
                    ...prev,
                    [pkg.id]: {
                      ...editState,
                      billingCadenceLabel: event.target.value,
                    },
                  }))
                }
                placeholder="Billing cadence label (optional)"
              />
              <Select
                value={editState.status}
                onChange={(event) =>
                  setEditStateById((prev) => ({
                    ...prev,
                    [pkg.id]: coerceEditorStateByStatus(
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
              <Input
                type="number"
                min={0}
                value={editState.sortOrder}
                onChange={(event) =>
                  setEditStateById((prev) => ({
                    ...prev,
                    [pkg.id]: {
                      ...editState,
                      sortOrder: Number.parseInt(event.target.value, 10) || 0,
                    },
                  }))
                }
                placeholder="Sort order"
              />
            </div>

            <Textarea
              className="mt-3 min-h-[90px]"
              value={editState.description}
              onChange={(event) =>
                setEditStateById((prev) => ({
                  ...prev,
                  [pkg.id]: { ...editState, description: event.target.value },
                }))
              }
              placeholder="Description (optional)"
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <label className="inline-flex items-center gap-2 text-sm text-foreground">
                  <Switch
                    checked={editState.isPublic}
                    disabled={editState.status !== "active"}
                    onCheckedChange={(checked) =>
                      setEditStateById((prev) => ({
                        ...prev,
                        [pkg.id]: {
                          ...editState,
                          isPublic: editState.status === "active" ? checked : false,
                        },
                      }))
                    }
                  />
                  Public visibility
                </label>
                <p className="text-xs text-muted-foreground">
                  Only active public packages appear on your public profile and
                  Apply form.
                </p>
                {packageLeadReferenceCountsQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">
                    Checking lead references before enabling delete...
                  </p>
                ) : hasLeadReferences ? (
                  <p className="text-xs text-muted-foreground">
                    {usageLabel}. This package is referenced by existing leads and
                    cannot be permanently deleted. Archive it instead.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {usageLabel}. Delete is available because no leads reference
                    this package.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busyKey === "reorder" || !canMoveUp}
                  onClick={() => void handleMove(pkg.id, "up")}
                >
                  <ArrowUp className="h-4 w-4" />
                  Up
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busyKey === "reorder" || !canMoveDown}
                  onClick={() => void handleMove(pkg.id, "down")}
                >
                  <ArrowDown className="h-4 w-4" />
                  Down
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => setArchiveCandidate(pkg)}
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
                  onClick={() => setDeleteCandidate(pkg)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => void handleSave(pkg.id)}
                >
                  <Save className="h-4 w-4" />
                  {busyKey === `save:${pkg.id}` ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
        );
      })}

      {splitFiltered.archived.length > 0 ? (
        <div className="space-y-3">
          {activeFilter === "all" ? (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Archived packages
            </p>
          ) : null}
          {splitFiltered.archived.map((pkg) => {
            const editState = editStateById[pkg.id] ?? toPackageEditorState(pkg);
            const leadReferenceCount = packageLeadReferenceCounts[pkg.id];
            const resolvedLeadReferenceCount = leadReferenceCount ?? 0;
            const usageLabel = getPackageUsageLabel(resolvedLeadReferenceCount);
            const hasLeadReferences = resolvedLeadReferenceCount > 0;
            const canDelete =
              !packageLeadReferenceCountsQuery.isLoading && !hasLeadReferences;
            return (
              <div
                key={pkg.id}
                className="rounded-[20px] border border-border/60 bg-background/20 p-4 opacity-90"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{pkg.title}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        packageLeadReferenceCountsQuery.isLoading
                          ? "muted"
                          : getPackageUsageVariant(resolvedLeadReferenceCount)
                      }
                    >
                      {packageLeadReferenceCountsQuery.isLoading
                        ? "Checking usage..."
                        : usageLabel}
                    </Badge>
                    <Badge variant="muted">{getPackageDisplayState(editState)}</Badge>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>Display order {pkg.sortOrder}</span>
                  <span>Updated {getPackageLastUpdatedLabel(pkg)}</span>
                  {!packageLeadReferenceCountsQuery.isLoading ? (
                    <span>{usageLabel}</span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {getPackageStateHelperCopy(editState)}
                </p>
                {packageLeadReferenceCountsQuery.isLoading ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Checking lead references before enabling delete...
                  </p>
                ) : hasLeadReferences ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {usageLabel}. This package is referenced by existing leads and
                    cannot be permanently deleted. Keep it archived to preserve
                    historical lead records.
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {usageLabel}. This archived package has no lead references and
                    can be deleted.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busyKey === `delete:${pkg.id}` || !canDelete}
                    title={
                      canDelete
                        ? "Delete this package permanently"
                        : "This package is referenced by existing leads and cannot be permanently deleted."
                    }
                    onClick={() => setDeleteCandidate(pkg)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyKey === `save:${pkg.id}`}
                    onClick={() => void handleSave(pkg.id)}
                  >
                    <Save className="h-4 w-4" />
                    {busyKey === `save:${pkg.id}` ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {filteredPackages.length === 0 &&
      packagesQuery.isSuccess &&
      packages.length > 0 ? (
        <div className="rounded-[20px] border border-dashed border-border/60 bg-background/30 px-4 py-5 text-sm text-muted-foreground">
          No packages match this filter.
        </div>
      ) : null}

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
            <AlertDialogCancel disabled={busyKey !== null}>Cancel</AlertDialogCancel>
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
              This package will be permanently removed from PT Hub, public profile
              display, and Apply-form selection. This delete is only available
              because no leads currently reference this package.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyKey !== null}>Cancel</AlertDialogCancel>
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
