import { cn } from "../../lib/utils";
import { BloomField } from "../../pages/public/bloom-field";
import { AppFooter } from "./app-footer";

export const authFooterClassName =
  "pointer-events-auto relative z-20 w-full shrink-0 !bg-transparent !text-[oklch(0.29_0.035_155/0.92)]";

export const authFooterContentClassName =
  "!text-[oklch(0.29_0.035_155/0.9)] [&_*]:!text-[oklch(0.29_0.035_155/0.9)] [&_a:hover]:!text-[oklch(0.24_0.07_155)] [&_button]:!border-[oklch(0.34_0.055_155/0.32)] [&_button]:!bg-[oklch(0.99_0.006_92/0.36)] [&_button:hover]:!border-[oklch(0.34_0.055_155/0.5)] [&_button:hover]:!bg-[oklch(0.99_0.006_92/0.56)] [&_button_svg]:!text-[oklch(0.29_0.035_155/0.9)]";

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
      <BloomField
        className="absolute inset-[-6%] scale-[1.02]"
        motionAmount={0.24}
        speed={0.24}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,rgba(251,249,241,0.5),transparent_38%),linear-gradient(180deg,rgba(251,249,241,0.08),transparent_26%,rgba(11,69,51,0.05))]" />
      <div className="auth-flow-grain absolute inset-0 opacity-[0.16] mix-blend-soft-light" />
    </div>
  );
}
