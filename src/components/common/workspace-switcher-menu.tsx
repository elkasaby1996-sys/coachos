import type { ReactNode } from "react";
import { ArrowUpRight, Building2, Check, Plus } from "lucide-react";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";

type WorkspaceSwitcherMenuItem = {
  id: string;
  name: string | null;
  meta?: string | null;
};

type WorkspaceSwitcherMenuProps = {
  label: string;
  hubLabel: string;
  hubMeta: string;
  hubActive: boolean;
  onSelectHub: () => void;
  workspaces: WorkspaceSwitcherMenuItem[];
  currentWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  loading: boolean;
  loadingLabel: string;
  emptyLabel: string;
  createLabel?: string;
  createMeta?: string;
  onCreateWorkspace?: () => void;
  className?: string;
};

function WorkspaceSwitcherRow({
  icon,
  label,
  meta,
  active = false,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  meta?: string | null;
  active?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem className="mt-1" onClick={onSelect}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="app-dropdown-icon-badge">{icon}</span>
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{label}</p>
          {meta ? (
            <p className="text-xs text-muted-foreground">{meta}</p>
          ) : null}
        </div>
      </div>
      {active ? (
        <Check className="h-4 w-4 text-primary [stroke-width:1.9]" />
      ) : null}
    </DropdownMenuItem>
  );
}

export function WorkspaceSwitcherMenu({
  label,
  hubLabel,
  hubMeta,
  hubActive,
  onSelectHub,
  workspaces,
  currentWorkspaceId,
  onSelectWorkspace,
  loading,
  loadingLabel,
  emptyLabel,
  createLabel,
  createMeta,
  onCreateWorkspace,
  className,
}: WorkspaceSwitcherMenuProps) {
  return (
    <DropdownMenuContent
      variant="menu"
      align="end"
      sideOffset={10}
      className={cn("w-72", className)}
    >
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <WorkspaceSwitcherRow
        icon={
          <ArrowUpRight className="h-4 w-4 text-[var(--module-overview-text)] [stroke-width:1.7]" />
        }
        label={hubLabel}
        meta={hubMeta}
        active={hubActive}
        onSelect={onSelectHub}
      />
      <DropdownMenuSeparator />
      {loading ? (
        <DropdownMenuItem disabled>{loadingLabel}</DropdownMenuItem>
      ) : workspaces.length === 0 ? (
        <DropdownMenuItem disabled>{emptyLabel}</DropdownMenuItem>
      ) : (
        workspaces.map((workspace) => (
          <WorkspaceSwitcherRow
            key={workspace.id}
            icon={
              <Building2 className="h-4 w-4 text-[var(--module-coaching-text)] [stroke-width:1.7]" />
            }
            label={workspace.name?.trim() || "PT Workspace"}
            meta={workspace.meta}
            active={workspace.id === currentWorkspaceId}
            onSelect={() => onSelectWorkspace(workspace.id)}
          />
        ))
      )}
      {onCreateWorkspace ? (
        <>
          <DropdownMenuSeparator />
          <WorkspaceSwitcherRow
            icon={
              <Plus className="h-4 w-4 text-[var(--module-coaching-text)] [stroke-width:1.7]" />
            }
            label={createLabel ?? "Create workspace"}
            meta={createMeta}
            onSelect={onCreateWorkspace}
          />
        </>
      ) : null}
    </DropdownMenuContent>
  );
}
