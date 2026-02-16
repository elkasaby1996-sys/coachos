import { cn } from "../../lib/utils";

interface AuthBackdropProps {
  children: React.ReactNode;
  brandName?: string;
  logo?: React.ReactNode;
  contentClassName?: string;
}

export function AuthBackdrop({
  children,
  contentClassName,
}: AuthBackdropProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,oklch(var(--primary)/0.24),transparent_38%),radial-gradient(circle_at_84%_14%,oklch(var(--chart-4)/0.14),transparent_38%),radial-gradient(circle_at_50%_100%,oklch(var(--chart-1)/0.12),transparent_46%),linear-gradient(135deg,oklch(var(--background))_12%,oklch(var(--card))_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,oklch(var(--background)/0.84)_100%)]" />

      <div className={cn("relative z-10 w-full", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
