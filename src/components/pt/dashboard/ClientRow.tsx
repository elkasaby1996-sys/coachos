import { Badge } from "../../ui/badge";
import { MiniSparkline } from "./MiniSparkline";
import { StatusPill } from "./StatusPill";

const makeInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

export function ClientRow({
  name,
  joined,
  adherence,
  status,
  onClick,
}: {
  name: string;
  joined: string;
  adherence: string;
  status: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border/70 bg-background/40 px-4 py-3 text-left transition hover:border-border hover:bg-muted/40"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/70 text-xs font-semibold">
          {makeInitials(name)}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{name}</p>
            <StatusPill status={status} />
          </div>
          <p className="text-xs text-muted-foreground">Joined {joined}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Adherence</p>
          <p className="text-sm font-semibold text-accent">{adherence}</p>
        </div>
        <MiniSparkline />
      </div>
    </button>
  );
}