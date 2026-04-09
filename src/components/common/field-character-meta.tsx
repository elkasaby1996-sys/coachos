import { cn } from "../../lib/utils";

export function FieldCharacterMeta({
  count,
  limit,
  errorText,
  className,
  showCounter,
}: {
  count: number;
  limit: number;
  errorText?: string | null;
  className?: string;
  showCounter?: boolean;
}) {
  const overLimit = Boolean(errorText);
  const shouldShowCounter = showCounter ?? limit > 255;

  if (!shouldShowCounter && !errorText) {
    return null;
  }

  return (
    <div className="space-y-1">
      {shouldShowCounter ? (
        <div
          className={cn(
            "pointer-events-none -mt-6 flex justify-end pr-2",
            className,
          )}
        >
          <span
            className={cn(
              "inline-flex min-w-[4.4rem] justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
              overLimit
                ? "border-danger/40 bg-danger/10 text-danger"
                : "border-border/80 bg-background/85 text-muted-foreground",
            )}
            title={`Max ${limit} chars`}
            aria-label={`Character count ${count} out of ${limit}`}
          >
            {count}/{limit}
          </span>
        </div>
      ) : null}
      {errorText ? (
        <p role="alert" className="text-xs text-danger">
          {errorText}
        </p>
      ) : null}
    </div>
  );
}
