import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export type ActionVisualState = "idle" | "saving" | "success" | "error";

export function ActionButtonLabel({
  state,
  idleLabel,
  savingLabel = "Saving...",
  successLabel = "Saved",
  errorLabel = "Try again",
}: {
  state: ActionVisualState;
  idleLabel: string;
  savingLabel?: string;
  successLabel?: string;
  errorLabel?: string;
}) {
  const reduceMotion = useReducedMotion();
  const contentByState = {
    idle: {
      icon: null,
      label: idleLabel,
    },
    saving: {
      icon: <Loader2 className="h-4 w-4 animate-spin" />,
      label: savingLabel,
    },
    success: {
      icon: <CheckCircle2 className="h-4 w-4" />,
      label: successLabel,
    },
    error: {
      icon: <AlertCircle className="h-4 w-4" />,
      label: errorLabel,
    },
  } as const;

  const content = contentByState[state];

  if (reduceMotion) {
    return (
      <>
        {content.icon}
        {content.label}
      </>
    );
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={state}
        className="inline-flex items-center gap-2"
        initial={{ opacity: 0, y: 6, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -4, filter: "blur(4px)" }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        {content.icon}
        <span>{content.label}</span>
      </motion.span>
    </AnimatePresence>
  );
}

export function ActionStatusMessage({
  children,
  tone = "success",
  className = "",
}: {
  children: ReactNode;
  tone?: "success" | "error" | "info";
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const toneClassName =
    tone === "success"
      ? "border-success/20 bg-success/10 text-success"
      : tone === "error"
        ? "border-danger/25 bg-danger/10 text-danger"
        : "border-border/70 bg-background/45 text-muted-foreground";

  if (!children) return null;

  if (reduceMotion) {
    return (
      <div className={`rounded-2xl border px-3 py-2 text-sm ${toneClassName} ${className}`}>
        {children}
      </div>
    );
  }

  return (
    <AnimatePresence initial={false}>
      <motion.div
        initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -6, filter: "blur(6px)" }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className={`rounded-2xl border px-3 py-2 text-sm ${toneClassName} ${className}`}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function AnimatedValue({
  value,
  className = "",
}: {
  value: string | number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <span className={className}>{value}</span>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={String(value)}
        className={className}
        initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        {value}
      </motion.span>
    </AnimatePresence>
  );
}

export function LoadingPanel({
  title = "Loading",
  description = "Preparing this section...",
  className = "",
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={`relative overflow-hidden rounded-[26px] border border-border/70 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.78),oklch(var(--bg-surface)/0.62))] px-5 py-5 shadow-[0_24px_56px_-40px_oklch(0_0_0/0.72)] ${className}`}
    >
      {!reduceMotion ? (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[-20%] top-0 h-24 bg-[radial-gradient(circle,oklch(var(--accent)/0.12),transparent_62%)] blur-3xl"
          animate={{ x: ["-8%", "8%", "-8%"], opacity: [0.35, 0.6, 0.35] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : null}
      <div className="relative z-10 space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/45 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          {title}
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="space-y-2.5">
          <div className="h-3 w-3/5 rounded-full bg-muted/60" />
          <div className="h-3 w-4/5 rounded-full bg-muted/45" />
          <div className="h-10 w-full rounded-[18px] bg-muted/35" />
        </div>
      </div>
    </div>
  );
}
