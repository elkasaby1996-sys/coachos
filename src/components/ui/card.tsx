import * as React from "react";
import { cn } from "../../lib/utils";
import {
  getModuleToneClasses,
  getModuleToneStyle,
  type ModuleTone,
} from "../../lib/module-tone";

type CardToneProps = {
  module?: ModuleTone | null;
};

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & CardToneProps
>(({ className, module, style, ...props }, ref) => {
  const moduleClasses = module ? getModuleToneClasses(module) : null;

  return (
    <div
      ref={ref}
      className={cn(
        "surface-panel overflow-hidden text-card-foreground transition-[transform,border-color,box-shadow] duration-300 ease-out",
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
      className={cn(
        "flex flex-col gap-2 px-5 py-4 sm:px-6 sm:py-5",
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
      className={cn(
        "text-base font-semibold tracking-tight text-foreground",
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
    className={cn("px-5 pb-5 pt-0 sm:px-6 sm:pb-6", className)}
    {...props}
  />
));
CardContent.displayName = "CardContent";

export { Card, CardHeader, CardTitle, CardContent };
