import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowDown, ArrowUp, Plus, Save } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Select } from "../../../components/ui/select";
import { Switch } from "../../../components/ui/switch";
import { Textarea } from "../../../components/ui/textarea";
import { useSessionAuth } from "../../../lib/auth";
import {
  archivePtPackage,
  createPtPackage,
  reorderPtPackages,
  updatePtPackage,
  usePtPackages,
} from "../lib/pt-hub";
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
  return {
    title: pkg.title,
    subtitle: pkg.subtitle ?? "",
    description: pkg.description ?? "",
    priceLabel: pkg.priceLabel ?? "",
    billingCadenceLabel: pkg.billingCadenceLabel ?? "",
    status: pkg.status,
    isPublic: pkg.isPublic,
    sortOrder: pkg.sortOrder,
  };
}

function packageStatusVariant(status: PTPackageStatus) {
  if (status === "active") return "success" as const;
  if (status === "archived") return "muted" as const;
  return "warning" as const;
}

export function PtHubPackageManager() {
  const { user } = useSessionAuth();
  const queryClient = useQueryClient();
  const packagesQuery = usePtPackages();
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

  async function handleArchive(packageId: string) {
    if (!user?.id) return;

    setBusyKey(`archive:${packageId}`);
    setFeedback(null);
    try {
      await archivePtPackage({ ptUserId: user.id, packageId });
      await invalidatePackageQueries();
      setFeedback({ tone: "success", text: "Package archived." });
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

    const currentIndex = packages.findIndex((pkg) => pkg.id === packageId);
    if (currentIndex < 0) return;

    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= packages.length) return;

    const reordered = [...packages];
    const [moved] = reordered.splice(currentIndex, 1);
    if (!moved) return;
    reordered.splice(nextIndex, 0, moved);

    setBusyKey("reorder");
    setFeedback(null);
    try {
      await reorderPtPackages({
        ptUserId: user.id,
        orderedIds: reordered.map((pkg) => pkg.id),
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
          Draft, activate, and reorder packages for public apply intake.
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
              setCreateState((prev) => ({
                ...prev,
                status: event.target.value as PTPackageStatus,
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
              onCheckedChange={(checked) =>
                setCreateState((prev) => ({ ...prev, isPublic: checked }))
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
        <Textarea
          className="mt-3 min-h-[96px]"
          value={createState.description}
          onChange={(event) =>
            setCreateState((prev) => ({ ...prev, description: event.target.value }))
          }
          placeholder="Description (optional)"
        />
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
          No packages yet. Add one draft package, then activate and set public visibility when ready.
        </div>
      ) : null}

      {packages.map((pkg, index) => {
        const editState = editStateById[pkg.id] ?? toPackageEditorState(pkg);
        const isBusy = busyKey === `save:${pkg.id}` || busyKey === `archive:${pkg.id}`;

        return (
          <div
            key={pkg.id}
            className="rounded-[20px] border border-border/60 bg-background/35 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{pkg.title}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={packageStatusVariant(editState.status)}>
                  {editState.status}
                </Badge>
                <Badge variant={editState.isPublic ? "success" : "muted"}>
                  {editState.isPublic ? "Public" : "Hidden"}
                </Badge>
              </div>
            </div>

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
                    [pkg.id]: {
                      ...editState,
                      status: event.target.value as PTPackageStatus,
                    },
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
              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <Switch
                  checked={editState.isPublic}
                  onCheckedChange={(checked) =>
                    setEditStateById((prev) => ({
                      ...prev,
                      [pkg.id]: { ...editState, isPublic: checked },
                    }))
                  }
                />
                Public visibility
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busyKey === "reorder" || index === 0}
                  onClick={() => void handleMove(pkg.id, "up")}
                >
                  <ArrowUp className="h-4 w-4" />
                  Up
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busyKey === "reorder" || index === packages.length - 1}
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
                  onClick={() => void handleArchive(pkg.id)}
                >
                  <Archive className="h-4 w-4" />
                  Archive
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
    </div>
  );
}
