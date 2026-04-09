import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  SurfaceCard,
  SurfaceCardContent,
  SurfaceCardDescription,
  SurfaceCardHeader,
  SurfaceCardTitle,
} from "../../client/portal";
import { cn } from "../../../lib/utils";

export function DashboardCard({
  title,
  subtitle,
  action,
  className,
  children,
}: {
  title: ReactNode;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      whileHover={
        reduceMotion
          ? undefined
          : { y: -3, transition: { duration: 0.2, ease: "easeOut" } }
      }
    >
      <SurfaceCard className={cn(className)}>
        <SurfaceCardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border/55 pb-4">
          <div>
            <SurfaceCardTitle className="text-base">{title}</SurfaceCardTitle>
            {subtitle ? (
              <SurfaceCardDescription className="mt-1">
                {subtitle}
              </SurfaceCardDescription>
            ) : null}
          </div>
          {action}
        </SurfaceCardHeader>
        <SurfaceCardContent className="pt-4">{children}</SurfaceCardContent>
      </SurfaceCard>
    </motion.div>
  );
}

// Example:
// <DashboardCard title="Schedule" subtitle="Next 14 days" action={<Button size="sm">Add</Button>}>
//   <div className="space-y-2">...</div>
// </DashboardCard>
