import * as React from "react";
import { cn } from "../../lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  isInvalid?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, isInvalid, ...props }, ref) => (
    <textarea
      className={cn(
        "app-field app-field-textarea w-full px-3.5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      data-invalid={isInvalid ? "true" : undefined}
      aria-invalid={isInvalid || props["aria-invalid"] ? true : undefined}
      ref={ref}
      {...props}
    />
  ),
);

Textarea.displayName = "Textarea";

export { Textarea };

