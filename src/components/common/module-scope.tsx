import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";
import { getModuleToneStyle, type ModuleTone } from "../../lib/module-tone";

type ModuleScopeProps<T extends ElementType> = {
  as?: T;
  module: ModuleTone;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
} & Omit<HTMLAttributes<HTMLElement>, "className" | "style">;

export function ModuleScope<T extends ElementType = "div">({
  as,
  module,
  children,
  className,
  style,
  ...props
}: ModuleScopeProps<T>) {
  const Component = (as ?? "div") as ElementType;

  return (
    <Component
      className={cn(className)}
      style={{ ...getModuleToneStyle(module), ...style }}
      {...props}
    >
      {children}
    </Component>
  );
}
