import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { cn } from "../../../lib/utils";

export function PtHubSectionCard({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden rounded-[28px] border border-border/70 bg-[linear-gradient(180deg,rgba(18,24,38,0.86),rgba(11,15,25,0.9))] shadow-[0_24px_70px_-52px_rgba(0,0,0,0.85)]",
        className,
      )}
    >
      <CardHeader className="space-y-0 border-b border-border/60 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold tracking-tight text-foreground">
              {title}
            </CardTitle>
            {description ? (
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap gap-2">{actions}</div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent
        className={cn("space-y-5 px-5 py-5 sm:px-6", contentClassName)}
      >
        {children}
      </CardContent>
    </Card>
  );
}
