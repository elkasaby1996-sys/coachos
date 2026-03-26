import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl border text-sm font-medium tracking-tight transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background",
  {
    variants: {
      variant: {
        default:
          "border-primary/40 bg-primary text-primary-foreground shadow-[0_10px_30px_-18px_oklch(0.75_0.18_195/0.6)] hover:border-primary/50 hover:bg-primary/92",
        secondary:
          "border-border/80 bg-secondary/58 text-secondary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.04)] hover:border-border hover:bg-secondary/78",
        ghost:
          "border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-background/62 hover:text-foreground",
        accent:
          "border-accent/40 bg-accent/90 text-accent-foreground shadow-[0_10px_28px_-20px_oklch(0.75_0.18_195/0.65)] hover:bg-accent",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-9 px-3.5 text-[13px]",
        lg: "h-11 px-8",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button };
