import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../../components/ui/alert";
import { Separator } from "../../../components/ui/separator";
import { cn } from "../../../lib/utils";
import {
  getModuleToneClasses,
  getModuleToneStyle,
} from "../../../lib/module-tone";

export function SettingsPageShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const toneClasses = getModuleToneClasses("settings");

  return (
    <section className="space-y-6" style={getModuleToneStyle("settings")}>
      <header className="space-y-1">
        <p
          className={cn(
            "inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em]",
            toneClasses.text,
          )}
        >
          <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", toneClasses.dot)} />
          Settings
        </p>
        <h2
          className={cn(
            "text-[1.85rem] font-semibold tracking-tight text-foreground",
            toneClasses.title,
          )}
        >
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
      <div className="rounded-[24px] border border-border/70 bg-[linear-gradient(180deg,oklch(var(--card)/0.98),oklch(var(--card)/0.9))]">
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
        !noBorder && "border-b border-border/70",
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
      <Alert tone={variant === "error" ? "danger" : "success"}>
        <AlertTitle>{variant === "error" ? "Error" : "Saved"}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    </div>
  );
}
