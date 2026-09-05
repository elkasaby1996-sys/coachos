import * as React from "react";
import { cn } from "../../lib/utils";
import {
  getModuleToneClasses,
  getModuleToneStyle,
  type ModuleTone,
} from "../../lib/module-tone";

type CardToneProps = {
  module?: ModuleTone | null;
  tone?: "danger" | "warning" | "success" | "info";
  variant?: "default" | "inset";
};

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & CardToneProps
>(({ className, module, tone, variant = "default", style, ...props }, ref) => {
  const moduleClasses = module ? getModuleToneClasses(module) : null;

  return (
    <div
      ref={ref}
      data-ui="card"
      data-surface={variant}
      data-tone={tone}
      className={cn(
        "ui-card surface-panel overflow-hidden text-card-foreground transition-colors duration-200",
        module && moduleClasses?.card,
        className,
      )}
      style={{
        ...getModuleToneStyle(module),
        ...style,
      }}
      {...props}
    />
  );
});
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & CardToneProps
>(({ className, module, style, ...props }, ref) => {
  const moduleClasses = module ? getModuleToneClasses(module) : null;

  return (
    <div
      ref={ref}
      data-ui="card-header"
      className={cn(
        "ui-card-header flex flex-col gap-2 px-5 py-4",
        module && moduleClasses?.panel,
        className,
      )}
      style={{
        ...getModuleToneStyle(module),
        ...style,
      }}
      {...props}
    />
  );
});
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement> & CardToneProps
>(({ className, module, style, ...props }, ref) => {
  const moduleClasses = module ? getModuleToneClasses(module) : null;

  return (
    <h3
      ref={ref}
      data-ui="card-title"
      className={cn(
        "ui-card-title text-base font-semibold tracking-tight text-foreground",
        module && moduleClasses?.title,
        className,
      )}
      style={{
        ...getModuleToneStyle(module),
        ...style,
      }}
      {...props}
    />
  );
});
CardTitle.displayName = "CardTitle";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-ui="card-content"
    className={cn("ui-card-content p-5", className)}
    {...props}
  />
));
CardContent.displayName = "CardContent";

export { Card, CardHeader, CardTitle, CardContent };
