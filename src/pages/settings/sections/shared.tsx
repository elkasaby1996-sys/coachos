import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../../components/ui/alert";
import { Separator } from "../../../components/ui/separator";
import { cn } from "../../../lib/utils";

export function SettingsPageShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
      <div className="rounded-2xl border border-border bg-card/70">
        {children}
      </div>
    </section>
  );
}

export function SettingsBlock({
  title,
  description,
  children,
  noBorder,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  noBorder?: boolean;
}) {
  return (
    <div
      className={cn(
        "space-y-5 px-5 py-5 md:px-6",
        !noBorder && "border-b border-border",
      )}
    >
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function SettingsRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_1fr] md:items-start md:gap-6">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function SettingsActions({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-end gap-2">{children}</div>;
}

export function SettingsInlineSeparator() {
  return <Separator className="my-4" />;
}

export function SettingsToast({
  message,
  variant,
}: {
  message: string | null;
  variant: "success" | "error";
}) {
  if (!message) return null;

  return (
    <div className="fixed right-6 top-6 z-50 w-[280px]">
      <Alert
        className={
          variant === "error" ? "border-danger/30" : "border-emerald-200"
        }
      >
        <AlertTitle>{variant === "error" ? "Error" : "Saved"}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    </div>
  );
}
