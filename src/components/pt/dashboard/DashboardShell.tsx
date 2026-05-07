import { StaggerGroup } from "../../common/motion-primitives";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <StaggerGroup className="space-y-6" stagger={0.08} delayChildren={0.04}>
      {children}
    </StaggerGroup>
  );
}
