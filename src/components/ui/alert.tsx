import * as React from "react";
import { cn } from "../../lib/utils";
import { semanticToneClassNames, type SemanticTone } from "../../lib/semantic-status";

export function Alert({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: SemanticTone | null }) {
  return (
    <div
      role="alert"
      className={cn(
        "surface-panel rounded-[22px] px-4 py-3 text-sm text-foreground",
        tone && semanticToneClassNames[tone].surface,
        className,
      )}
      {...props}
    />
  );
}

export function AlertTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h5
      className={cn("mb-1 text-sm font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

export function AlertDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <div
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
