import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

type PageContainerProps<T extends ElementType> = {
  as?: T;
  children: ReactNode;
  className?: string;
  size?: "default" | "portal" | "client-shell";
  align?: "center" | "left";
} & Omit<HTMLAttributes<HTMLElement>, "className">;

export function PageContainer<T extends ElementType = "div">({
  as,
  children,
  className,
  size = "default",
  align = "center",
  ...props
}: PageContainerProps<T>) {
  const Component = (as ?? "div") as ElementType;
  return (
    <Component
      className={cn(
        align === "left" ? "ml-0 mr-auto" : "mx-auto",
        size === "portal"
          ? "w-full max-w-[1360px] px-4 sm:px-6 lg:px-8 xl:px-10"
          : size === "client-shell"
            ? "w-full max-w-[1380px] px-4 sm:px-6 lg:px-6 xl:px-6"
            : "w-full max-w-[1800px] 2xl:max-w-[2000px] px-4 sm:px-6 lg:px-8",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
