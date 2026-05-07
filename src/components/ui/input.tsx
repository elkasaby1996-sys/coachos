import * as React from "react";
import { cn } from "../../lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { isInvalid?: boolean }
>(({ className, type, isInvalid, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "app-field flex min-h-[2.75rem] w-full px-3.5 py-2 disabled:cursor-not-allowed disabled:opacity-60",
      className,
    )}
    data-invalid={isInvalid ? "true" : undefined}
    aria-invalid={isInvalid || props["aria-invalid"] ? true : undefined}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
