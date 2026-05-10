import { cn } from "../../lib/utils";
import { AppFooter } from "./app-footer";

export const authFooterClassName =
  "pointer-events-auto relative z-20 w-full shrink-0 !bg-transparent !text-[oklch(0.99_0.004_95/0.96)]";

export const authFooterContentClassName =
  "!text-[oklch(0.99_0.004_95/0.94)] [&_*]:!text-[oklch(0.99_0.004_95/0.94)] [&_a:hover]:!text-[oklch(1_0_0)] [&_button]:!border-white/45 [&_button]:!bg-white/[0.06] [&_button:hover]:!border-white/60 [&_button:hover]:!bg-white/[0.1] [&_button_svg]:!text-[oklch(0.99_0.004_95/0.96)]";

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
    <div className="pt-hub-theme pt-hub-theme-light auth-flow-canvas relative isolate flex h-dvh flex-col overflow-hidden text-foreground">
      <AuthFlowBackground />

      <div
        className={cn(
          "relative z-10 mx-auto flex min-h-0 w-full flex-1 items-start justify-center overflow-y-auto px-4 py-8 sm:items-center sm:px-6 lg:px-8",
          contentClassName,
        )}
      >
        {children}
      </div>

      <AppFooter
        surface="transparent"
        className={authFooterClassName}
        contentClassName={authFooterContentClassName}
      />
    </div>
  );
}

export function AuthFlowBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,oklch(0.37_0.08_150/0.72),transparent_34%),radial-gradient(circle_at_50%_28%,oklch(0.965_0.012_92/0.94),transparent_30%),radial-gradient(circle_at_86%_58%,oklch(0.18_0.018_165/0.7),transparent_36%),linear-gradient(112deg,oklch(0.31_0.065_148),oklch(0.88_0.012_92)_45%,oklch(0.1_0.012_170))]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,oklch(0.23_0.055_150/0.68),oklch(0.94_0.01_92/0.58)_44%,oklch(0.09_0.01_170/0.72))] backdrop-blur-[36px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_52%_36%,oklch(0.98_0.006_92/0.44),transparent_34%),linear-gradient(180deg,oklch(1_0_0/0.08),transparent_28%,oklch(0_0_0/0.08))]" />
    </div>
  );
}
