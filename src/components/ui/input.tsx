import * as React from "react";
import { cn } from "../../lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "flex min-h-[2.75rem] w-full rounded-2xl border border-input/80 bg-secondary/30 px-3.5 py-2 text-sm text-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.04)] transition-[background-color,border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring/60 focus-visible:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
