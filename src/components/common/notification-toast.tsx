import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "../../lib/icons";

type NotificationToastProps = {
  message: string | null;
  title?: string;
  tone?: "success" | "error";
  onDismiss: () => void;
};

export function NotificationToast(props: NotificationToastProps) {
  return props.message ? (
    <ToastNotice key={`${props.title}:${props.message}`} {...props} />
  ) : null;
}

function ToastNotice({
  message,
  title = "Saved",
  tone = "success",
  onDismiss,
}: NotificationToastProps) {
  const dismissRef = useRef(onDismiss);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (hovered || focused || tone === "error") return;
    const timer = window.setTimeout(() => dismissRef.current(), 6000);
    return () => window.clearTimeout(timer);
  }, [hovered, focused, tone]);

  return createPortal(
    <div
      className="fixed right-4 top-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm items-start gap-3 rounded-xl border border-border bg-card p-4 text-foreground shadow-lg sm:right-6 sm:top-6"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <span
        aria-hidden="true"
        className={`mt-1 h-5 w-1 shrink-0 rounded-full ${tone === "error" ? "bg-danger" : "bg-primary"}`}
      />
      <div
        className="min-w-0 flex-1 space-y-1 text-sm leading-5 [overflow-wrap:anywhere]"
        role={tone === "error" ? "alert" : "status"}
        aria-atomic="true"
      >
        <p className="font-semibold">{title}</p>
        <p>{message}</p>
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onDismiss}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>,
    document.body,
  );
}
